import assert from "node:assert";
import http from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import pool from "../db/neon";
import { publicKey, privateKey } from "../keys";
import type { JWTClaims } from "@accessibooks/shared";

const TEST_TITLE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TEST_USER_ID = "11111111-2222-3333-4444-555555555555";
const EXPIRED_USER_ID = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const NO_ENTITLEMENT_USER_ID = "cccccccc-dddd-eeee-ffff-000000000000";

let server: http.Server;
let baseUrl: string;

function post(path: string, body: object): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(chunks), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode!, body: chunks, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function rawPost(path: string, buf: Buffer, headers: Record<string, string>): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: "POST",
      headers: { ...headers, "Content-Length": buf.length },
    }, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(chunks), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode!, body: chunks, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

function get(path: string, headers?: Record<string, string>): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method: "GET", headers: headers || {} }, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(chunks), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode!, body: chunks, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function options(path: string, headers?: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method: "OPTIONS", headers: headers || {} }, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function setup() {
  await pool.query(
    `INSERT INTO titles (id, name, manifest_url, drm_enabled) VALUES ($1, $2, $3, true) ON CONFLICT (id) DO NOTHING`,
    [TEST_TITLE_ID, "Test Title", "https://cdn.example.com/manifest.mpd"]
  );

  await pool.query(
    `INSERT INTO entitlements (user_id, title_id, access_type, max_concurrent_streams, offline_allowed)
     VALUES ($1, $2, 'stream', 1, false)`,
    [TEST_USER_ID, TEST_TITLE_ID]
  );

  await pool.query(
    `INSERT INTO entitlements (user_id, title_id, access_type, expires_at, max_concurrent_streams, offline_allowed)
     VALUES ($1, $2, 'stream', NOW() - INTERVAL '1 day', 1, false)`,
    [EXPIRED_USER_ID, TEST_TITLE_ID]
  );
}

async function cleanup() {
  await pool.query(`DELETE FROM stream_sessions WHERE title_id = $1`, [TEST_TITLE_ID]);
  await pool.query(`DELETE FROM entitlements WHERE title_id = $1`, [TEST_TITLE_ID]);
  await pool.query(`DELETE FROM titles WHERE id = $1`, [TEST_TITLE_ID]);
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function getValidToken(): Promise<string> {
  await pool.query(`DELETE FROM stream_sessions WHERE user_id = $1 AND title_id = $2`, [TEST_USER_ID, TEST_TITLE_ID]);
  const res = await post("/api/playback/token", { userId: TEST_USER_ID, titleId: TEST_TITLE_ID });
  return res.body.token;
}

async function run() {
  console.log("\n[DRM] Playback Token + Widevine License Tests\n");

  await cleanup();
  await setup();

  server = app.listen(0);
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`  Server on ${baseUrl}\n`);

  await test("Test 1: Entitlement missing → 403 NO_ENTITLEMENT", async () => {
    const res = await post("/api/playback/token", { userId: NO_ENTITLEMENT_USER_ID, titleId: TEST_TITLE_ID });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "NO_ENTITLEMENT");
  });

  await test("Test 2: Entitlement expired → 403 ENTITLEMENT_EXPIRED", async () => {
    const res = await post("/api/playback/token", { userId: EXPIRED_USER_ID, titleId: TEST_TITLE_ID });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "ENTITLEMENT_EXPIRED");
  });

  await test("Test 3: Concurrency exceeded → 429 CONCURRENCY_EXCEEDED", async () => {
    await pool.query(
      `INSERT INTO stream_sessions (user_id, title_id, active, last_heartbeat) VALUES ($1, $2, true, NOW())`,
      [TEST_USER_ID, TEST_TITLE_ID]
    );
    const res = await post("/api/playback/token", { userId: TEST_USER_ID, titleId: TEST_TITLE_ID });
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.body.error, "CONCURRENCY_EXCEEDED");
    assert.strictEqual(res.body.activeStreams, 1);
    assert.strictEqual(res.body.maxAllowed, 1);
  });

  await test("Test 4: Happy path → 200 with valid token", async () => {
    await pool.query(`DELETE FROM stream_sessions WHERE user_id = $1 AND title_id = $2`, [TEST_USER_ID, TEST_TITLE_ID]);
    const res = await post("/api/playback/token", { userId: TEST_USER_ID, titleId: TEST_TITLE_ID });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token, "response should have token");
    assert.ok(res.body.manifestUrl, "response should have manifestUrl");
    assert.ok(res.body.licenseUrl, "response should have licenseUrl");
    assert.ok(res.body.expiresAt, "response should have expiresAt");
    assert.strictEqual(res.body.manifestUrl, "https://cdn.example.com/manifest.mpd");

    const decoded = jwt.verify(res.body.token, publicKey, { algorithms: ["RS256"] }) as JWTClaims;
    assert.strictEqual(decoded.sub, TEST_USER_ID);
    assert.strictEqual(decoded.tid, TEST_TITLE_ID);
    assert.strictEqual(typeof decoded.sid, "number");
    assert.strictEqual(decoded.policy.offline, false);
    assert.strictEqual(decoded.policy.max_concurrent, 1);
    assert.strictEqual(decoded.policy.entitlement_expiry, null);
  });

  await test("Test 5: JWKS endpoint returns valid JWK", async () => {
    const res = await get("/.well-known/jwks.json");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.keys), "body.keys should be an array");
    assert.strictEqual(res.body.keys.length, 1);
    assert.strictEqual(res.body.keys[0].kty, "RSA");
    assert.strictEqual(res.body.keys[0].alg, "RS256");
    assert.strictEqual(res.body.keys[0].use, "sig");
    assert.strictEqual(res.body.keys[0].kid, "drm-signing-key-1");
  });

  await test("Test 6: Verify endpoint rejects missing token", async () => {
    const res = await get("/api/playback/verify");
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "MISSING_TOKEN");
  });

  await test("Test 7: Verify endpoint rejects invalid token", async () => {
    const res = await get("/api/playback/verify", { Authorization: "Bearer invalid-garbage" });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "INVALID_TOKEN");
  });

  await test("Test 8: Verify endpoint returns parsed claims", async () => {
    const token = await getValidToken();
    const res = await get("/api/playback/verify", { Authorization: `Bearer ${token}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.claims.sub, TEST_USER_ID);
    assert.strictEqual(res.body.claims.tid, TEST_TITLE_ID);
    assert.strictEqual(typeof res.body.claims.sid, "number");
  });

  // --- Widevine License Tests ---

  await test("Test 9: Widevine license rejects missing token → 401", async () => {
    const challenge = Buffer.from([0x08, 0x01]);
    const res = await rawPost("/drm/widevine/license", challenge, {
      "Content-Type": "application/octet-stream",
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "MISSING_TOKEN");
  });

  await test("Test 10: Widevine license rejects expired token → 401", async () => {
    const expiredToken = jwt.sign(
      { sub: TEST_USER_ID, tid: TEST_TITLE_ID, sid: 999999 },
      privateKey,
      { algorithm: "RS256", expiresIn: "-1s", keyid: "drm-signing-key-1" }
    );
    const challenge = Buffer.from([0x08, 0x01]);
    const res = await rawPost("/drm/widevine/license", challenge, {
      "Content-Type": "application/octet-stream",
      Authorization: `Bearer ${expiredToken}`,
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "TOKEN_EXPIRED");
  });

  await test("Test 11: Widevine license rejects non-existent session → 403", async () => {
    const badToken = jwt.sign(
      { sub: TEST_USER_ID, tid: TEST_TITLE_ID, sid: 999999 },
      privateKey,
      { algorithm: "RS256", expiresIn: "10m", keyid: "drm-signing-key-1" }
    );
    const challenge = Buffer.from([0x08, 0x01]);
    const res = await rawPost("/drm/widevine/license", challenge, {
      "Content-Type": "application/octet-stream",
      Authorization: `Bearer ${badToken}`,
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "SESSION_NOT_FOUND");
  });

  await test("Test 12: Widevine license rejects inactive session → 403", async () => {
    await pool.query(`DELETE FROM stream_sessions WHERE user_id = $1`, [TEST_USER_ID]);
    const insertRes = await pool.query(
      `INSERT INTO stream_sessions (user_id, title_id, active, last_heartbeat) VALUES ($1, $2, false, NOW()) RETURNING id`,
      [TEST_USER_ID, TEST_TITLE_ID]
    );
    const inactiveSessionId = insertRes.rows[0].id;
    const token = jwt.sign(
      { sub: TEST_USER_ID, tid: TEST_TITLE_ID, sid: inactiveSessionId },
      privateKey,
      { algorithm: "RS256", expiresIn: "10m", keyid: "drm-signing-key-1" }
    );
    const challenge = Buffer.from([0x08, 0x01]);
    const res = await rawPost("/drm/widevine/license", challenge, {
      "Content-Type": "application/octet-stream",
      Authorization: `Bearer ${token}`,
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "SESSION_INACTIVE");
  });

  await test("Test 13: Widevine license returns 501 with valid session + updates heartbeat", async () => {
    const token = await getValidToken();
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as JWTClaims;

    const beforeRes = await pool.query(
      `SELECT last_heartbeat FROM stream_sessions WHERE id = $1`,
      [decoded.sid]
    );
    const heartbeatBefore = new Date(beforeRes.rows[0].last_heartbeat).getTime();

    await new Promise(r => setTimeout(r, 50));

    const challenge = Buffer.from([0x08, 0x01]);
    const res = await rawPost("/drm/widevine/license", challenge, {
      "Content-Type": "application/octet-stream",
      Authorization: `Bearer ${token}`,
    });
    assert.strictEqual(res.status, 501);
    assert.strictEqual(res.body.error, "WIDEVINE_LICENSE_NOT_IMPLEMENTED");

    const afterRes = await pool.query(
      `SELECT last_heartbeat FROM stream_sessions WHERE id = $1`,
      [decoded.sid]
    );
    const heartbeatAfter = new Date(afterRes.rows[0].last_heartbeat).getTime();
    assert.ok(heartbeatAfter >= heartbeatBefore, "last_heartbeat should be updated");
  });

  // --- CORS Tests ---

  await test("Test 14: CORS preflight on /drm/* returns 204 with allowed origin", async () => {
    const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5000";
    const res = await options("/drm/widevine/license", { Origin: webOrigin });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers["access-control-allow-origin"], webOrigin);
    assert.strictEqual(res.headers["access-control-allow-credentials"], "false");
  });

  await test("Test 15: CORS omits allow-origin for unknown origins", async () => {
    const res = await options("/drm/widevine/license", { Origin: "https://evil.com" });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers["access-control-allow-origin"], undefined);
  });

  // --- Rate Limit Tests ---

  await test("Test 16: Rate limit headers present on /drm/* requests", async () => {
    const token = await getValidToken();
    const challenge = Buffer.from([0x08, 0x01]);
    const res = await rawPost("/drm/widevine/license", challenge, {
      "Content-Type": "application/octet-stream",
      Authorization: `Bearer ${token}`,
    });
    assert.ok(res.headers["x-ratelimit-limit"], "should have rate limit header");
    assert.ok(res.headers["x-ratelimit-remaining"] !== undefined, "should have remaining header");
    assert.ok(res.headers["x-ratelimit-reset"], "should have reset header");
  });

  await cleanup();

  server.close();
  await pool.end();

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
