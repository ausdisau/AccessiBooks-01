import type { Express } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { communityAnnotations, books, users } from "@workspace/db";
import { isAuthenticated, requireAdmin } from "./multiAuth";

// Community annotation pipeline (Task #121).
//
// Flow: any signed-in reader submits a candidate annotation for a book
// (status "pending") -> an admin reviews it in the moderation UI
// (approve/reject) -> approved annotations are served publicly and the ebook
// reader renders them with source: "community" (purple border + label).
//
// Personal annotations never touch this table — they live in
// annotation_sync / localStorage (see revenueRoutes.ts).

/** Highlight colour used for every community annotation (purple, matching the reader's community styling). */
const COMMUNITY_HIGHLIGHT_COLOR = "#a855f7";

const MAX_TEXT_LEN = 4000;
const MAX_NOTE_LEN = 2000;
/** Anti-spam: a user may only have this many annotations awaiting review at once. */
const MAX_PENDING_PER_USER = 20;

function currentUserId(req: any): string | null {
  return req.user?.id || req.user?.claims?.sub || null;
}

/**
 * Privacy-friendly public display name: first name + last initial only.
 * NEVER derives from email — contributor names are persisted and served on a
 * public endpoint, so a null (rendered as a neutral "community contribution"
 * label) is the only acceptable fallback.
 */
export function contributorDisplayName(
  u?: { firstName: string | null; lastName: string | null } | null,
): string | null {
  const first = u?.firstName?.trim();
  if (!first) return null;
  const last = u?.lastName?.trim();
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export function registerCommunityAnnotationRoutes(app: Express): void {
  // Approved annotations for a book — public: every reader (incl. guests)
  // sees them, shaped exactly like the reader's Annotation objects.
  app.get("/api/books/:bookId/community-annotations", async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(communityAnnotations)
        .where(
          and(
            eq(communityAnnotations.bookId, req.params.bookId),
            eq(communityAnnotations.status, "approved"),
          ),
        )
        .orderBy(communityAnnotations.page, communityAnnotations.startOffset)
        .limit(500);

      res.json(
        rows.map((r) => ({
          id: r.id,
          page: r.page,
          startOffset: r.startOffset,
          endOffset: r.endOffset,
          text: r.text,
          note: r.note,
          color: COMMUNITY_HIGHLIGHT_COLOR,
          createdAt: (r.createdAt ?? new Date()).toISOString(),
          source: "community" as const,
          contributor: r.contributorName ?? undefined,
          approvedAt: r.approvedAt ? r.approvedAt.toISOString() : undefined,
        })),
      );
    } catch (err: any) {
      console.error("[CommunityAnnotations] list failed:", err.message);
      res.status(500).json({ message: "Failed to load community annotations" });
    }
  });

  // Submit a candidate annotation. Stays "pending" until a moderator decides.
  app.post("/api/books/:bookId/community-annotations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = currentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { page, startOffset, endOffset, text, note } = req.body ?? {};
      if (!Number.isInteger(page) || page < 1) {
        return res.status(400).json({ message: "Invalid page" });
      }
      if (
        !Number.isInteger(startOffset) ||
        !Number.isInteger(endOffset) ||
        startOffset < 0 ||
        endOffset < startOffset
      ) {
        return res.status(400).json({ message: "Invalid text range" });
      }
      if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT_LEN) {
        return res.status(400).json({ message: `Highlighted text is required (max ${MAX_TEXT_LEN} characters)` });
      }
      if (typeof note !== "string" || !note.trim() || note.length > MAX_NOTE_LEN) {
        return res.status(400).json({
          message: `A note is required so readers know why this passage matters (max ${MAX_NOTE_LEN} characters)`,
        });
      }

      // The book must exist (bookId is intentionally not a FK — catalog rows churn).
      const [bookRow] = await db
        .select({ id: books.id })
        .from(books)
        .where(eq(books.id, req.params.bookId))
        .limit(1);
      if (!bookRow) return res.status(404).json({ message: "Book not found" });

      // Snapshot a privacy-friendly display name at submission time.
      const [u] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const contributorName = contributorDisplayName(u);

      // Count + insert must be atomic or concurrent submissions bypass the
      // pending cap. A per-user advisory xact lock serializes submissions.
      const created = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${"community_annotations:" + userId}))`,
        );
        const [{ pendingCount }] = await tx
          .select({ pendingCount: sql<number>`count(*)::int` })
          .from(communityAnnotations)
          .where(
            and(
              eq(communityAnnotations.contributorId, userId),
              eq(communityAnnotations.status, "pending"),
            ),
          );
        if (pendingCount >= MAX_PENDING_PER_USER) return null;
        const [row] = await tx
          .insert(communityAnnotations)
          .values({
            bookId: req.params.bookId,
            contributorId: userId,
            contributorName,
            page,
            startOffset,
            endOffset,
            text: text.trim(),
            note: note.trim(),
          })
          .returning();
        return row;
      });
      if (!created) {
        return res.status(429).json({
          message: "You have too many annotations awaiting review. Please wait for a moderator to catch up.",
        });
      }

      res.status(201).json({ id: created.id, status: created.status, message: "Submitted for moderator review" });
    } catch (err: any) {
      console.error("[CommunityAnnotations] submit failed:", err.message);
      res.status(500).json({ message: "Failed to submit annotation" });
    }
  });

  // Moderation queue — list by status (default pending), newest first.
  app.get("/api/admin/community-annotations", requireAdmin, async (req: any, res) => {
    try {
      const requested = String(req.query.status ?? "pending");
      const status = ["pending", "approved", "rejected"].includes(requested) ? requested : "pending";
      const rows = await db
        .select({
          id: communityAnnotations.id,
          bookId: communityAnnotations.bookId,
          page: communityAnnotations.page,
          text: communityAnnotations.text,
          note: communityAnnotations.note,
          status: communityAnnotations.status,
          contributorId: communityAnnotations.contributorId,
          contributorName: communityAnnotations.contributorName,
          reviewNote: communityAnnotations.reviewNote,
          createdAt: communityAnnotations.createdAt,
          approvedAt: communityAnnotations.approvedAt,
          bookTitle: books.title,
        })
        .from(communityAnnotations)
        .leftJoin(books, eq(books.id, communityAnnotations.bookId))
        .where(eq(communityAnnotations.status, status))
        .orderBy(desc(communityAnnotations.createdAt))
        .limit(200);
      res.json(rows);
    } catch (err: any) {
      console.error("[CommunityAnnotations] admin list failed:", err.message);
      res.status(500).json({ message: "Failed to load annotations" });
    }
  });

  // Approve or reject. Re-reviewing is allowed (a moderator may change a decision).
  app.patch("/api/admin/community-annotations/:id/review", requireAdmin, async (req: any, res) => {
    try {
      const adminId = currentUserId(req);
      const { action, reviewNote } = req.body ?? {};
      if (action !== "approve" && action !== "reject") {
        return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
      }
      if (reviewNote != null && (typeof reviewNote !== "string" || reviewNote.length > 1000)) {
        return res.status(400).json({ message: "Invalid review note" });
      }

      const [updated] = await db
        .update(communityAnnotations)
        .set({
          status: action === "approve" ? "approved" : "rejected",
          approvedAt: action === "approve" ? new Date() : null,
          reviewedBy: adminId,
          reviewNote: typeof reviewNote === "string" && reviewNote.trim() ? reviewNote.trim() : null,
        })
        .where(eq(communityAnnotations.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Annotation not found" });
      res.json(updated);
    } catch (err: any) {
      console.error("[CommunityAnnotations] review failed:", err.message);
      res.status(500).json({ message: "Failed to review annotation" });
    }
  });
}
