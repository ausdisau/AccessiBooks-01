import type { Express } from "express";
import { db } from "./db";
import { books, bookAuslanCompanions, AUSLAN_COMPANION_STATUSES } from "@workspace/db";
import { and, count, desc, eq } from "drizzle-orm";
import { isAuthenticated, requireAdmin } from "./multiAuth";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "./replit_integrations/object_storage";

const objectStorageService = new ObjectStorageService();

// Human-produced Auslan companion videos are uploaded media; constrain type + size.
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB

const uploadUrlSchema = z.object({
  name: z.string().min(1).optional(),
  contentType: z.string().min(1),
  size: z.number().int().positive().optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2000).optional(),
  objectPath: z.string().min(1),
  mimeType: z.string().min(1).max(80).optional(),
  sizeBytes: z.number().int().positive().optional(),
  durationSeconds: z.number().int().positive().optional(),
  language: z.string().trim().min(1).max(16).optional(),
  status: z.enum(AUSLAN_COMPANION_STATUSES).optional(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(AUSLAN_COMPANION_STATUSES).optional(),
  language: z.string().trim().min(1).max(16).optional(),
});

// books.auslanAvailable is a denormalized browse-filter hint: true iff at least one
// published companion exists for the book. Recompute it after any companion mutation.
async function recomputeAuslanAvailable(bookId: string): Promise<boolean> {
  const [row] = await db
    .select({ c: count() })
    .from(bookAuslanCompanions)
    .where(and(eq(bookAuslanCompanions.bookId, bookId), eq(bookAuslanCompanions.status, "published")));
  const available = (row?.c ?? 0) > 0;
  await db.update(books).set({ auslanAvailable: available }).where(eq(books.id, bookId));
  return available;
}

// Keep the object-storage ACL in lockstep with publication state. Published
// companions are shown to everyone (including signed-out browsers), so the
// underlying object must be publicly readable. Draft/archived/deleted
// companions must NOT be public — otherwise unpublished media stays fetchable
// by anyone who knows (or guesses) the object URL. The uploader keeps access to
// private objects via path-encoded ownership, so admins can still preview drafts.
async function syncCompanionAcl(objectPath: string, ownerUserId: string, isPublished: boolean): Promise<void> {
  await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
    owner: ownerUserId,
    visibility: isPublished ? "public" : "private",
  });
}

// Revoke public read (set private). A missing underlying object is fine — there
// is nothing public left to leak — so ObjectNotFoundError is swallowed; any
// other failure propagates so callers can fail closed on visibility changes.
async function revokePublicAcl(objectPath: string, ownerUserId: string): Promise<void> {
  try {
    await syncCompanionAcl(objectPath, ownerUserId, false);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return;
    throw err;
  }
}

export function registerAuslanCompanionRoutes(app: Express) {
  // PUBLIC: published companions for a book (surfaced in reader/player for all users).
  app.get("/api/books/:id/auslan-companions", async (req: any, res) => {
    try {
      const bookId = req.params.id;
      const rows = await db
        .select()
        .from(bookAuslanCompanions)
        .where(and(eq(bookAuslanCompanions.bookId, bookId), eq(bookAuslanCompanions.status, "published")))
        .orderBy(desc(bookAuslanCompanions.createdAt));
      res.json(rows);
    } catch (error) {
      req.log?.error({ err: error }, "Failed to list Auslan companions");
      res.status(500).json({ message: "Failed to list Auslan companions" });
    }
  });

  // ADMIN: all companions (any status) for management UI.
  app.get("/api/admin/books/:id/auslan-companions", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const bookId = req.params.id;
      const rows = await db
        .select()
        .from(bookAuslanCompanions)
        .where(eq(bookAuslanCompanions.bookId, bookId))
        .orderBy(desc(bookAuslanCompanions.createdAt));
      res.json(rows);
    } catch (error) {
      req.log?.error({ err: error }, "Failed to list Auslan companions (admin)");
      res.status(500).json({ message: "Failed to list Auslan companions" });
    }
  });

  // ADMIN: mint a presigned upload URL for the companion video.
  app.post("/api/admin/books/:id/auslan-companions/upload-url", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const parsed = uploadUrlSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      const { contentType, size } = parsed.data;
      if (!ALLOWED_VIDEO_TYPES.includes(contentType)) {
        return res.status(400).json({ message: "Only MP4, WebM, OGG, and MOV video files are accepted" });
      }
      if (size && size > MAX_VIDEO_SIZE) {
        return res.status(400).json({ message: "Video files must be under 500MB" });
      }
      const uploadURL = await objectStorageService.getObjectEntityUploadURL(userId);
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
    } catch (error) {
      req.log?.error({ err: error }, "Failed to mint Auslan upload URL");
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  // ADMIN: create the companion record after the client has uploaded the file.
  app.post("/api/admin/books/:id/auslan-companions", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const bookId = req.params.id;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      const { title, description, objectPath, mimeType, sizeBytes, durationSeconds, language, status } = parsed.data;

      // Ownership: the path must encode THIS admin as the uploader (our upload-url
      // route mints owner-scoped paths). This blocks an admin from attaching an
      // arbitrary existing upload path they don't own, or a forged/legacy path.
      const pathOwner = objectStorageService.getUploadOwnerFromObjectPath(objectPath);
      if (!pathOwner || pathOwner !== userId) {
        return res.status(400).json({ message: "Invalid object path" });
      }

      const [book] = await db.select({ id: books.id }).from(books).where(eq(books.id, bookId));
      if (!book) return res.status(404).json({ message: "Book not found" });

      // Validate the ACTUAL uploaded object (existence + real content type/size),
      // not just the client-declared values, before we record or publish it.
      let realType = "";
      let realSize = NaN;
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        const [meta] = await objectFile.getMetadata();
        realType = meta.contentType ? String(meta.contentType) : "";
        realSize = meta.size != null ? Number(meta.size) : NaN;
      } catch (metaErr) {
        req.log?.error({ err: metaErr }, "Auslan companion upload not found");
        return res.status(400).json({ message: "Uploaded file not found or inaccessible" });
      }
      // Trust storage metadata, not client-declared values: the object becomes
      // publicly served once published, so it must really be an allowlisted video
      // of a sane size.
      if (!ALLOWED_VIDEO_TYPES.includes(realType)) {
        return res.status(400).json({ message: "Only MP4, WebM, OGG, and MOV video files are accepted" });
      }
      if (!Number.isFinite(realSize) || realSize <= 0 || realSize > MAX_VIDEO_SIZE) {
        return res.status(400).json({ message: "Video file must be a valid size under 500MB" });
      }

      const desiredStatus = status ?? "draft";

      // Insert the row FIRST. Uploads are private by default, so a failed insert
      // (e.g. the one-published-per-(book,language) unique index → 23505, mapped
      // to 409 in the catch below) leaves no publicly reachable object behind.
      const [created] = await db
        .insert(bookAuslanCompanions)
        .values({
          bookId,
          title,
          description: description ?? null,
          objectPath,
          mimeType: realType,
          sizeBytes: realSize,
          durationSeconds: durationSeconds ?? null,
          language: language ?? "AUSLAN",
          status: desiredStatus,
          uploadedByUserId: userId,
        })
        .returning();

      // Only a published companion is made public; if the ACL write fails, roll
      // back the row so we never persist a "published" record whose media isn't
      // actually public.
      if (desiredStatus === "published") {
        try {
          await syncCompanionAcl(objectPath, userId, true);
        } catch (aclErr) {
          await db.delete(bookAuslanCompanions).where(eq(bookAuslanCompanions.id, created.id)).catch(() => {});
          req.log?.error({ err: aclErr }, "Failed to set ACL for Auslan companion");
          return res.status(400).json({ message: "Uploaded file not found or inaccessible" });
        }
      }

      await recomputeAuslanAvailable(bookId);

      res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(409).json({ message: "A published companion already exists for this language" });
      }
      req.log?.error({ err: error }, "Failed to create Auslan companion");
      res.status(500).json({ message: "Failed to create Auslan companion" });
    }
  });

  // ADMIN: update title/description/language/status (publish, archive, etc.).
  app.patch("/api/admin/books/:id/auslan-companions/:cid", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id: bookId, cid } = req.params;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      const updates = parsed.data;
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No fields to update" });

      const [existing] = await db
        .select({
          id: bookAuslanCompanions.id,
          objectPath: bookAuslanCompanions.objectPath,
          status: bookAuslanCompanions.status,
          uploadedByUserId: bookAuslanCompanions.uploadedByUserId,
        })
        .from(bookAuslanCompanions)
        .where(and(eq(bookAuslanCompanions.id, cid), eq(bookAuslanCompanions.bookId, bookId)));
      if (!existing) return res.status(404).json({ message: "Companion not found" });

      const aclOwner = existing.uploadedByUserId ?? req.user?.id;
      const becomingPublic = updates.status === "published" && existing.status !== "published";
      const losingPublic =
        existing.status === "published" && !!updates.status && updates.status !== "published";

      // Going private (archive/unpublish): revoke public read BEFORE persisting,
      // and fail closed if revocation fails — never report a private status while
      // the object is still publicly fetchable.
      if (losingPublic) {
        try {
          await revokePublicAcl(existing.objectPath, aclOwner);
        } catch (aclErr) {
          req.log?.error({ err: aclErr }, "Failed to revoke Auslan companion ACL");
          return res.status(400).json({ message: "Could not update companion visibility in storage" });
        }
      }

      const [updated] = await db
        .update(bookAuslanCompanions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(bookAuslanCompanions.id, cid))
        .returning();

      // Going public: make the object readable AFTER the row is published; if the
      // ACL write fails, roll the status back so DB and storage stay consistent.
      if (becomingPublic) {
        try {
          await syncCompanionAcl(existing.objectPath, aclOwner, true);
        } catch (aclErr) {
          await db
            .update(bookAuslanCompanions)
            .set({ status: existing.status, updatedAt: new Date() })
            .where(eq(bookAuslanCompanions.id, cid))
            .catch(() => {});
          req.log?.error({ err: aclErr }, "Failed to set Auslan companion ACL");
          return res.status(400).json({ message: "Could not update companion visibility in storage" });
        }
      }

      await recomputeAuslanAvailable(bookId);
      res.json(updated);
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(409).json({ message: "A published companion already exists for this language" });
      }
      req.log?.error({ err: error }, "Failed to update Auslan companion");
      res.status(500).json({ message: "Failed to update Auslan companion" });
    }
  });

  // ADMIN: delete a companion and recompute the browse flag.
  app.delete("/api/admin/books/:id/auslan-companions/:cid", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id: bookId, cid } = req.params;
      const [existing] = await db
        .select({
          id: bookAuslanCompanions.id,
          objectPath: bookAuslanCompanions.objectPath,
          uploadedByUserId: bookAuslanCompanions.uploadedByUserId,
        })
        .from(bookAuslanCompanions)
        .where(and(eq(bookAuslanCompanions.id, cid), eq(bookAuslanCompanions.bookId, bookId)));
      if (!existing) return res.status(404).json({ message: "Companion not found" });

      // Revoke public read BEFORE removing the row, and fail closed if revocation
      // fails — otherwise we'd report a successful delete while the media is still
      // publicly fetchable by direct URL. A missing object is treated as success.
      try {
        await revokePublicAcl(existing.objectPath, existing.uploadedByUserId ?? req.user?.id);
      } catch (aclErr) {
        req.log?.error({ err: aclErr }, "Failed to revoke ACL for Auslan companion");
        return res.status(500).json({ message: "Could not remove companion media" });
      }

      await db.delete(bookAuslanCompanions).where(eq(bookAuslanCompanions.id, cid));
      await recomputeAuslanAvailable(bookId);

      res.json({ success: true });
    } catch (error) {
      req.log?.error({ err: error }, "Failed to delete Auslan companion");
      res.status(500).json({ message: "Failed to delete Auslan companion" });
    }
  });
}
