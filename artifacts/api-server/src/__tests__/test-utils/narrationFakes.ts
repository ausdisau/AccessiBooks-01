import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { getTableName } from "drizzle-orm";
import { narrationJobs, narrationAssets } from "@workspace/db/schema";

// ---------------------------------------------------------------------------
// Shared fixtures + a minimal in-memory fake of the drizzle query surface that
// narration.ts uses. The fake routes reads/writes by drizzle table NAME (via
// getTableName), so it survives vi.resetModules() re-imports where table object
// identity would otherwise differ.
// ---------------------------------------------------------------------------

export const LOREM =
  "The lighthouse keeper watched the grey sea roll in under a low winter sky, " +
  "counting the gulls that wheeled above the harbour wall while the tide crept " +
  "slowly across the flats and the town behind him woke to another quiet morning.";

// A curated-plus-extra voice list matching ELEVENLABS_DEFAULT_VOICES shape so
// getNarrationVoices() can filter it down to the narration allow-list.
export const FAKE_VOICES = [
  { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", category: "premade", description: "Calm" },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", category: "premade", description: "Soft" },
  { voice_id: "ErXwobaYiN019PkySvjV", name: "Antoni", category: "premade", description: "Male" },
  { voice_id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", category: "premade", description: "Deep" },
  { voice_id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", category: "premade", description: "British" },
  { voice_id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", category: "premade", description: "British female" },
  // Not in the narration allow-list — must be filtered out by getNarrationVoices.
  { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", category: "premade", description: "Excluded" },
];

export type Row = Record<string, unknown>;
export interface FakeDbState {
  jobs: Row[];
  assets: Row[];
}

function tableKind(table: unknown): "jobs" | "assets" {
  const name = getTableName(table as never);
  if (name === getTableName(narrationJobs)) return "jobs";
  if (name === getTableName(narrationAssets)) return "assets";
  throw new Error(`Fake db received unexpected table: ${name}`);
}

export function createFakeDb(): { db: unknown; state: FakeDbState } {
  const state: FakeDbState = { jobs: [], assets: [] };
  const rowsFor = (table: unknown) => (tableKind(table) === "jobs" ? state.jobs : state.assets);

  const db = {
    select() {
      return {
        from(table: unknown) {
          const rows = rowsFor(table);
          const chain = {
            where() {
              return chain;
            },
            async limit(n: number) {
              return rows.slice(0, n);
            },
            async orderBy() {
              return [...rows];
            },
          };
          return chain;
        },
      };
    },
    insert(table: unknown) {
      const kind = tableKind(table);
      const rows = kind === "jobs" ? state.jobs : state.assets;
      let values: Row = {};
      const api = {
        values(v: Row) {
          values = { ...v };
          return api;
        },
        async onConflictDoUpdate({ set }: { target?: unknown; set: Row }) {
          const idx =
            kind === "jobs"
              ? rows.findIndex((r) => r.bookId === values.bookId && r.voiceId === values.voiceId)
              : rows.findIndex(
                  (r) =>
                    r.bookId === values.bookId &&
                    r.voiceId === values.voiceId &&
                    r.chapterNumber === values.chapterNumber,
                );
          if (idx >= 0) rows[idx] = { ...rows[idx], ...set };
          else rows.push({ ...values });
        },
      };
      return api;
    },
    update(table: unknown) {
      const rows = tableKind(table) === "jobs" ? state.jobs : state.assets;
      let patch: Row = {};
      const api = {
        set(p: Row) {
          patch = { ...p };
          return api;
        },
        async where() {
          for (const r of rows) Object.assign(r, patch);
        },
      };
      return api;
    },
  };

  return { db, state };
}

export function makeAddonStatus(overrides: Record<string, unknown> = {}) {
  return {
    feature: "ai_narration",
    label: "AI narration",
    description: "Generate narration for text titles",
    tier: "free",
    unlimited: false,
    limit: 1,
    used: 0,
    remaining: 1,
    allowed: true,
    upgradeRequired: false,
    ...overrides,
  };
}

export function fakeUpsellPayload(status: { feature?: string; tier?: string; limit?: unknown }) {
  return {
    error: "quota_exhausted",
    message: "You've used your allowance for this month. Upgrade to keep going.",
    upgradeRequired: true,
    feature: status.feature,
    currentTier: status.tier,
    limit: status.limit,
  };
}

export interface EbookStubOpts {
  content?: string;
  contentType?: string;
  status?: number;
  sample?: boolean;
}

/**
 * Boots a real ephemeral Express server hosting the narration routes plus a
 * stub `GET /api/ebook/:id/content` endpoint. process.env.PORT is pointed at
 * this server so narration.ts's fetchBookText() (which fetches
 * http://localhost:PORT/api/ebook/:id/content) resolves against the stub.
 */
export async function startTestServer(
  narrationModule: { registerNarrationRoutes: (app: Express) => void },
  ebook: EbookStubOpts = {},
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express();

  app.get("/api/ebook/:id/content", (_req, res) => {
    if (ebook.status && ebook.status !== 200) {
      res.status(ebook.status).end();
      return;
    }
    res.setHeader("content-type", ebook.contentType ?? "text/plain; charset=utf-8");
    if (ebook.sample) res.setHeader("X-Content-Source", "sample");
    res.send(ebook.content ?? LOREM);
  });

  narrationModule.registerNarrationRoutes(app);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const prevPort = process.env.PORT;
  process.env.PORT = String(port);

  return {
    baseUrl: `http://localhost:${port}`,
    close: async () => {
      if (prevPort === undefined) delete process.env.PORT;
      else process.env.PORT = prevPort;
      (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    },
  };
}

export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 15,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (!predicate()) throw new Error("waitFor: condition not met within timeout");
}
