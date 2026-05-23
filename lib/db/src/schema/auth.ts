// Replit Auth schema aliases.
//
// The AccessiBooks app already maintains rich `users` and `sessions` tables
// in schema.ts (with subscription_tier, stripe IDs, Passport session blobs,
// etc.). The Replit Auth server lib expects `usersTable` and `sessionsTable`
// exports. Rather than introducing a parallel set of tables (which would
// fragment user identity), we re-export the existing tables under the names
// the auth templates expect. The shared `users.id`, `email`, `firstName`,
// `lastName`, `profileImageUrl` columns are sufficient for OIDC upsert, and
// the `sessions` table's (sid, sess, expire) shape is already compatible.
export { users as usersTable, sessions as sessionsTable } from "./schema";
