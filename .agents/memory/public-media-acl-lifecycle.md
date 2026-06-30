---
name: Public media object-storage ACL lifecycle
description: Rule for any feature that uploads media to object storage and serves it publicly (e.g. Auslan companion videos) — keep the object ACL in lockstep with publication status, fail-closed.
---

# Public media object-storage ACL lifecycle

When a feature uploads media to object storage and later serves it to everyone
(signed-out browsers included), the object's ACL must track the row's
publication status — it is the real access boundary, not the DB row.

Rules (implemented for Auslan companions in `artifacts/api-server/src/auslanCompanions.ts`):

- **Public iff published.** Set the object `visibility: "public"` ONLY when
  `status === "published"`; otherwise keep it `private`. Revoke public read on
  unpublish/archive/**delete** — a deleted/draft row whose object stays public
  is still fetchable by direct URL.
- **Trust storage metadata, not the client.** Before persisting/publishing,
  fetch the real object metadata (`getObjectEntityFile().getMetadata()`) and
  require an allowlisted content-type + finite size within the cap. Do NOT fall
  back to client-declared MIME/size.
- **Verify path ownership.** The normalized upload path must decode to the
  acting user (`getUploadOwnerFromObjectPath(objectPath) === req.user.id`) so an
  admin can't attach an upload path they don't own.
- **Sequence ACL/DB writes fail-closed** so no failure leaves unpublished or
  deleted media public:
  - *Create:* insert the row FIRST (uploads are private by default, so a failed
    insert / unique-index 23505 leaves nothing public); only then set public on
    publish, and DELETE the just-inserted row if that ACL write throws.
  - *Publish (PATCH draft→published):* update DB first (uniqueness errors happen
    before publication), then set public; roll the status back if the ACL fails.
  - *Unpublish/archive (PATCH published→private):* revoke public FIRST and abort
    the DB change if revoke fails.
  - *Delete:* revoke public FIRST and fail closed (500, don't delete) if revoke
    fails; tolerate `ObjectNotFoundError` (nothing left to leak).

**Why:** code review repeatedly flagged fail-open windows — public ACL set on
every create incl. drafts, never revoked on archive/delete, and public-before-DB
ordering that leaks media when the DB write fails. The asymmetry is deliberate:
make-public happens AFTER the DB commit, make-private happens BEFORE it.

**How to apply:** reuse this ordering for any new uploaded-public-media surface
(creator covers, ad creatives served publicly, etc.). A `syncCompanionAcl`-style
helper plus a `revokePublicAcl` that swallows only `ObjectNotFoundError` keeps it
consistent.
