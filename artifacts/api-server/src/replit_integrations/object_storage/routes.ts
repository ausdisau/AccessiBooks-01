import type { Express, Request, Response, NextFunction } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { canAccessObject, ObjectPermission } from "./objectAcl";
import { isAuthenticated } from "../../multiAuth";

// Allow-list of content-types accepted by the generic upload endpoint.
// Restricts uploads to media types AccessiBooks actually serves; rejects
// HTML/JS/SVG/etc. that could be served back from the trusted origin and
// abused for stored-XSS or malware hosting.
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set<string>([
  // Audio
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/ogg",
  // Documents
  "application/pdf",
  "application/epub+zip",
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Hard upper bound on any single upload through this generic endpoint
// (matches the largest per-purpose limit in selfPublishing.ts).
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024; // 500 MB

// Path prefixes within the private bucket that are intentionally publicly
// readable (server-generated public assets, e.g. AI-generated book covers
// rendered in the browse UI without a session).
const PUBLIC_PRIVATE_BUCKET_PREFIXES = ["/objects/covers/"];

function isPublicPrivateBucketPath(path: string): boolean {
  return PUBLIC_PRIVATE_BUCKET_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * Register object storage routes for file uploads.
 *
 * SECURITY MODEL:
 * - POST /api/uploads/request-url is gated by `isAuthenticated`. The presigned
 *   PUT URL is scoped to `uploads/<userId>/<uuid>` so ownership is encoded in
 *   the path and cannot be forged at read time.
 * - GET /objects/*objectPath enforces:
 *   - /objects/public/* → public (resolved against PUBLIC_OBJECT_SEARCH_PATHS)
 *   - /objects/covers/* → public (server-generated AI covers used in browse UI)
 *   - /objects/uploads/<userId>/* → only that user (or an explicit ACL hit)
 *   - all other private paths → require auth + ACL match (deny by default)
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.post(
    "/api/uploads/request-url",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as { id?: string } | undefined)?.id;
        if (!userId) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        const { name, size, contentType } = req.body ?? {};

        if (typeof name !== "string" || name.length === 0 || name.length > 512) {
          return res.status(400).json({ error: "Invalid or missing 'name'" });
        }
        if (typeof contentType !== "string" || !ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)) {
          return res.status(400).json({ error: "Unsupported contentType" });
        }
        if (size !== undefined && size !== null) {
          if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
            return res.status(400).json({ error: "Invalid 'size'" });
          }
          if (size > MAX_UPLOAD_SIZE) {
            return res.status(400).json({ error: "File too large" });
          }
        }

        const uploadURL = await objectStorageService.getObjectEntityUploadURL(userId);
        const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

        return res.json({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        });
      } catch (error) {
        req.log?.error({ err: error }, "Error generating upload URL");
        return res.status(500).json({ error: "Failed to generate upload URL" });
      }
    }
  );

  /**
   * Serve uploaded objects with ACL/ownership enforcement.
   */
  const serveObject = async (req: Request, res: Response, _next: NextFunction) => {
    try {
      // 1) /objects/public/* → look up in PUBLIC_OBJECT_SEARCH_PATHS, no auth.
      const publicPrefix = "/objects/public/";
      if (req.path.startsWith(publicPrefix)) {
        const rest = req.path.slice(publicPrefix.length);
        const file = await objectStorageService.searchPublicObject(`public/${rest}`);
        if (!file) {
          return res.status(404).json({ error: "Object not found" });
        }
        return objectStorageService.downloadObject(file, res);
      }

      // 2) Server-generated public assets within the private bucket
      // (e.g. AI book covers) — public read OK, no auth required.
      if (isPublicPrivateBucketPath(req.path)) {
        const objectFile = await objectStorageService.getObjectEntityFile(req.path);
        return objectStorageService.downloadObject(objectFile, res);
      }

      // 3) Path-encoded ownership: /objects/uploads/<userId>/<uuid>
      const ownerFromPath = objectStorageService.getUploadOwnerFromObjectPath(
        req.path
      );
      const requesterId = (req.user as { id?: string } | undefined)?.id;
      const isAuthed = req.isAuthenticated?.() === true && !!requesterId;

      if (ownerFromPath) {
        // The owner can always fetch their own upload.
        if (isAuthed && requesterId === ownerFromPath) {
          const objectFile = await objectStorageService.getObjectEntityFile(req.path);
          return objectStorageService.downloadObject(objectFile, res);
        }
        // Non-owner: fall through to ACL check (object may have been shared).
      }

      // 4) All other private paths require an explicit ACL allowing the
      // requester. Files with no ACL set → denied (closed by default).
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const allowed = await canAccessObject({
        userId: isAuthed ? requesterId : undefined,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!allowed) {
        if (!isAuthed) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        return res.status(403).json({ error: "Forbidden" });
      }
      return objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      req.log?.error({ err: error }, "Error serving object");
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  };

  app.get("/objects/*objectPath", serveObject);
}

