/**
 * Offline unit tests for the Google OIDC account-resolution policy
 * (googleAccountLinking.ts). Uses injected deps — no DB, no network.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// The module transitively imports "@workspace/db" (barrel constructs a pg
// Pool) via ./db and ./storage; setup.ts sets a dummy DATABASE_URL so the
// import is safe, and we only exercise the injected-deps path.
import {
  resolveGoogleUser,
  type LinkingDeps,
  type GoogleLinkClaims,
} from "../googleAccountLinking";

const baseUser = {
  id: "legacy-123",
  email: "user@example.com",
  firstName: "Old",
  lastName: "User",
  profileImageUrl: null,
  authProvider: "google",
  providerId: "old-google-profile-id",
  passwordHash: null,
} as any;

function makeDeps(overrides: Partial<LinkingDeps> = {}): LinkingDeps & {
  audits: any[];
  created: any[];
  updates: any[];
} {
  const audits: any[] = [];
  const created: any[] = [];
  const updates: any[] = [];
  return {
    audits,
    created,
    updates,
    findUserById: vi.fn(async () => undefined),
    findUserByProviderSub: vi.fn(async () => undefined),
    findUserByEmail: vi.fn(async () => undefined),
    updateUser: vi.fn(async (id: string, set: any) => {
      updates.push({ id, set });
      return { ...baseUser, id, ...set };
    }),
    createUser: vi.fn(async (values: any) => {
      created.push(values);
      return { ...values };
    }),
    insertAudit: vi.fn(async (values: any) => {
      audits.push(values);
    }),
    ...overrides,
  };
}

const claims = (over: Partial<GoogleLinkClaims> = {}): GoogleLinkClaims => ({
  sub: "oidc-sub-1",
  email: "user@example.com",
  emailVerified: true,
  firstName: "New",
  lastName: "Name",
  profileImageUrl: "http://img",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("resolveGoogleUser", () => {
  it("resolves an account already keyed by the OIDC subject (exact id match)", async () => {
    const deps = makeDeps({
      findUserById: vi.fn(async (id: string) =>
        id === "google-oidc-sub-1" ? { ...baseUser, id: "google-oidc-sub-1" } : undefined,
      ),
    });
    const res = await resolveGoogleUser(claims(), deps);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") throw new Error("unreachable");
    expect(res.user.id).toBe("google-oidc-sub-1");
    expect(res.linked).toBe(false);
    expect(deps.created).toHaveLength(0);
    expect(deps.audits).toHaveLength(0);
  });

  it("resolves a previously linked account via providerId and keeps its original id", async () => {
    const deps = makeDeps({
      findUserByProviderSub: vi.fn(async (sub: string) =>
        sub === "oidc-sub-1" ? baseUser : undefined,
      ),
    });
    const res = await resolveGoogleUser(claims(), deps);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") throw new Error("unreachable");
    expect(res.user.id).toBe("legacy-123");
    expect(deps.updates[0].set.providerId).toBe("oidc-sub-1");
    expect(deps.audits).toHaveLength(0); // no re-audit on subsequent logins
  });

  it("auto-links a legacy account by verified email, preserves its id, and audits", async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn(async () => baseUser),
    });
    const res = await resolveGoogleUser(claims(), deps);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") throw new Error("unreachable");
    expect(res.user.id).toBe("legacy-123");
    expect(res.linked).toBe(true);
    expect(deps.updates[0].set).toMatchObject({
      authProvider: "google",
      providerId: "oidc-sub-1",
    });
    expect(deps.audits).toHaveLength(1);
    expect(deps.audits[0]).toMatchObject({
      userId: "legacy-123",
      provider: "google",
      providerSub: "oidc-sub-1",
      outcome: "linked",
    });
    expect(deps.created).toHaveLength(0);
  });

  it("does NOT link by email when email_verified is false", async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn(async () => undefined), // collision check only
    });
    const res = await resolveGoogleUser(claims({ emailVerified: false }), deps);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") throw new Error("unreachable");
    expect(res.user.id).toBe("google-oidc-sub-1"); // fresh account
    expect(deps.audits).toHaveLength(0);
  });

  it("does NOT link by email when the claim is missing (undefined counts as unverified)", async () => {
    const deps = makeDeps();
    const res = await resolveGoogleUser(claims({ emailVerified: undefined }), deps);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") throw new Error("unreachable");
    expect(res.user.id).toBe("google-oidc-sub-1");
    expect(deps.audits).toHaveLength(0);
  });

  it("denies deterministically when the matching account has a local password", async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn(async () => ({ ...baseUser, passwordHash: "bcrypt$hash" })),
    });
    const res = await resolveGoogleUser(claims(), deps);
    expect(res).toEqual({ status: "denied_local_password", email: "user@example.com" });
    // No duplicate account creation attempt (email is unique in the DB).
    expect(deps.created).toHaveLength(0);
    expect(deps.updates).toHaveLength(0);
    expect(deps.audits[0]).toMatchObject({ outcome: "skipped_local_password" });
  });

  it("still links (and still denies) when the audit insert fails — auditing is best-effort", async () => {
    const failingAudit = vi.fn(async () => {
      throw new Error("audit table missing");
    });
    const linkDeps = makeDeps({
      findUserByEmail: vi.fn(async () => baseUser),
      insertAudit: failingAudit,
    });
    const linkRes = await resolveGoogleUser(claims(), linkDeps);
    expect(linkRes.status).toBe("ok");
    if (linkRes.status !== "ok") throw new Error("unreachable");
    expect(linkRes.user.id).toBe("legacy-123");

    const denyDeps = makeDeps({
      findUserByEmail: vi.fn(async () => ({ ...baseUser, passwordHash: "x" })),
      insertAudit: failingAudit,
    });
    const denyRes = await resolveGoogleUser(claims(), denyDeps);
    expect(denyRes.status).toBe("denied_local_password");
  });

  it("provisions a brand-new account when nothing matches", async () => {
    const deps = makeDeps();
    const res = await resolveGoogleUser(claims({ email: "fresh@example.com" }), deps);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") throw new Error("unreachable");
    expect(deps.created[0]).toMatchObject({
      id: "google-oidc-sub-1",
      email: "fresh@example.com",
      authProvider: "google",
      providerId: "oidc-sub-1",
    });
  });

  it("drops an UNVERIFIED email that collides with an existing account instead of failing the unique constraint", async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn(async () => baseUser),
    });
    const res = await resolveGoogleUser(claims({ emailVerified: false }), deps);
    expect(res.status).toBe("ok");
    expect(deps.created[0].email).toBeNull();
  });
});
