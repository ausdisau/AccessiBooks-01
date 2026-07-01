import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createFakeDb,
  makeAddonStatus,
  fakeUpsellPayload,
  startTestServer,
  waitFor,
  FAKE_VOICES,
  type EbookStubOpts,
  type FakeDbState,
  type Row,
} from "./test-utils/narrationFakes";

const RACHEL = "21m00Tcm4TlvDq8ikWAM"; // a valid narration voice id

// Two heading-delimited chapters, each a single (<2500 char) TTS sub-chunk, so a
// "fail-second" tts mock completes chapter 1 and then fails chapter 2.
const TWO_CHAPTER_TEXT = [
  "Chapter One",
  "The lighthouse keeper watched the grey sea roll in under a low winter sky, counting the gulls that wheeled above the harbour wall.",
  "",
  "Chapter Two",
  "By evening the storm had passed and the town settled into an uneasy, salt-heavy quiet along the shore beneath the cliffs.",
].join("\n");

interface SetupOpts {
  book?: Row | null;
  elevenConfigured?: boolean;
  addonAllowed?: boolean;
  addonStatus?: Record<string, unknown>;
  tts?: "ok" | "throw" | "hang" | "fail-second";
  ebook?: EbookStubOpts;
  noUser?: boolean;
  seedAssets?: Row[];
  seedJobs?: Row[];
}

interface Harness {
  baseUrl: string;
  state: FakeDbState;
  getBook: ReturnType<typeof vi.fn>;
  getAiAddonStatus: ReturnType<typeof vi.fn>;
  incrementAiAddonUsage: ReturnType<typeof vi.fn>;
  ttsWithTs: ReturnType<typeof vi.fn>;
  tts: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

const openServers: Array<{ close: () => Promise<void> }> = [];

async function setup(opts: SetupOpts = {}): Promise<Harness> {
  vi.resetModules();

  const { db, state } = createFakeDb();
  if (opts.seedAssets) state.assets.push(...opts.seedAssets);
  if (opts.seedJobs) state.jobs.push(...opts.seedJobs);

  const defaultBook = { id: "book-1", title: "Test Book", contentType: "ebook" };
  const getBook = vi.fn().mockResolvedValue("book" in opts ? opts.book : defaultBook);
  const getAiAddonStatus = vi
    .fn()
    .mockResolvedValue(opts.addonStatus ?? makeAddonStatus({ allowed: opts.addonAllowed ?? true }));
  const incrementAiAddonUsage = vi.fn().mockResolvedValue(undefined);
  const isElevenLabsConfigured = vi.fn().mockReturnValue(opts.elevenConfigured ?? true);

  const okAudio = Buffer.from("ID3-FAKE-MP3-".repeat(64));
  const ttsWithTs = vi.fn();
  const tts = vi.fn();
  if (opts.tts === "throw") {
    ttsWithTs.mockRejectedValue(new Error("timestamped TTS failed"));
    tts.mockRejectedValue(new Error("ElevenLabs upstream 500: synthesis failed"));
  } else if (opts.tts === "fail-second") {
    // First chapter synthesizes successfully; every later sub-chunk fails on BOTH
    // the timestamped endpoint and the plain-TTS fallback, so chapter 2 aborts the
    // job after chapter 1 has already been persisted.
    ttsWithTs
      .mockResolvedValueOnce({ audio: okAudio, alignment: null })
      .mockRejectedValue(new Error("timestamped TTS failed on chapter 2"));
    tts.mockRejectedValue(new Error("ElevenLabs upstream 500: synthesis failed on chapter 2"));
  } else if (opts.tts === "hang") {
    ttsWithTs.mockReturnValue(new Promise<never>(() => {}));
    tts.mockReturnValue(new Promise<never>(() => {}));
  } else {
    ttsWithTs.mockResolvedValue({ audio: okAudio, alignment: null });
    tts.mockResolvedValue(okAudio);
  }
  const save = vi.fn().mockResolvedValue(undefined);

  vi.doMock("../db", () => ({ db, pool: {} }));
  vi.doMock("@workspace/db", async () => await import("@workspace/db/schema"));
  vi.doMock("../storage", () => ({ storage: { getBook } }));
  vi.doMock("../aiAddons", () => ({
    getAiAddonStatus,
    incrementAiAddonUsage,
    buildUpsellPayload: fakeUpsellPayload,
  }));
  vi.doMock("../multiAuth", () => ({
    isAuthenticated: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
      if (!opts.noUser) {
        const headers = req.headers as Record<string, string>;
        req.user = { id: headers["x-test-user"] || "test-user" };
      }
      next();
    },
  }));
  vi.doMock("../drm", () => ({
    rateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  }));
  vi.doMock("../replit_integrations/audio/elevenlabs", () => ({
    isElevenLabsConfigured,
    textToSpeech: tts,
    textToSpeechWithTimestamps: ttsWithTs,
    ELEVENLABS_DEFAULT_VOICES: FAKE_VOICES,
  }));
  vi.doMock("../replit_integrations/object_storage/objectStorage", () => ({
    objectStorageClient: { bucket: () => ({ file: () => ({ save }) }) },
  }));

  const mod = await import("../narration");
  const server = await startTestServer(mod, opts.ebook);
  openServers.push(server);

  return {
    baseUrl: server.baseUrl,
    state,
    getBook,
    getAiAddonStatus,
    incrementAiAddonUsage,
    ttsWithTs,
    tts,
    save,
  };
}

function generate(
  baseUrl: string,
  bookId: string,
  body: Record<string, unknown> = { voiceId: RACHEL },
  user?: string,
) {
  return fetch(`${baseUrl}/api/narration/${bookId}/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(user ? { "x-test-user": user } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  while (openServers.length) {
    const s = openServers.pop();
    await s?.close();
  }
  vi.resetModules();
  vi.doUnmock("../db");
  vi.doUnmock("@workspace/db");
});

describe("GET /api/narration/voices", () => {
  it("returns the curated narration voices and configured flag", async () => {
    const { baseUrl } = await setup();
    const res = await fetch(`${baseUrl}/api/narration/voices`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    // FAKE_VOICES has 7 entries; only the 6 allow-listed narration voices show.
    expect(body.voices).toHaveLength(6);
    expect(body.voices.every((v: { id: string }) => v.id !== "AZnzlk1XvdvUeBnXmlld")).toBe(true);
  });

  it("reports configured=false when ElevenLabs is not configured", async () => {
    const { baseUrl } = await setup({ elevenConfigured: false });
    const res = await fetch(`${baseUrl}/api/narration/voices`);
    const body = await res.json();
    expect(body.configured).toBe(false);
  });
});

describe("GET /api/narration/:bookId/status", () => {
  it("returns 'none' when there is no job and no assets", async () => {
    const { baseUrl } = await setup();
    const res = await fetch(`${baseUrl}/api/narration/book-1/status?voiceId=${RACHEL}`);
    const body = await res.json();
    expect(body.status).toBe("none");
    expect(body.totalChapters).toBe(0);
  });

  it("reports 'completed' from assets when no job row exists", async () => {
    const { baseUrl } = await setup({
      seedAssets: [
        { bookId: "book-1", voiceId: RACHEL, chapterNumber: 1, title: "Part 1", audioUrl: "/a1.mp3", durationSeconds: 10, timingJson: null },
      ],
    });
    const res = await fetch(`${baseUrl}/api/narration/book-1/status?voiceId=${RACHEL}`);
    const body = await res.json();
    expect(body.status).toBe("completed");
    expect(body.totalChapters).toBe(1);
  });

  it("surfaces a failed job with its user-facing error", async () => {
    const { baseUrl } = await setup({
      seedJobs: [
        { bookId: "book-1", voiceId: RACHEL, status: "failed", totalChapters: 3, completedChapters: 1, error: "synthesis failed" },
      ],
    });
    const res = await fetch(`${baseUrl}/api/narration/book-1/status?voiceId=${RACHEL}`);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.error).toBe("synthesis failed");
    expect(body.completedChapters).toBe(1);
  });
});

describe("GET /api/narration/:bookId/manifest", () => {
  it("maps assets to chapters including read-along timing", async () => {
    const timing = [{ start: 0, end: 1, text: "Hello world.", words: [{ text: "Hello", start: 0, end: 0.5, index: 0 }] }];
    const { baseUrl } = await setup({
      seedAssets: [
        { bookId: "book-1", voiceId: RACHEL, chapterNumber: 1, title: "Part 1", audioUrl: "/c1.mp3", durationSeconds: 42, timingJson: timing },
        { bookId: "book-1", voiceId: RACHEL, chapterNumber: 2, title: "Part 2", audioUrl: "/c2.mp3", durationSeconds: 7, timingJson: null },
      ],
    });
    const res = await fetch(`${baseUrl}/api/narration/book-1/manifest?voiceId=${RACHEL}`);
    const body = await res.json();
    expect(body.chapters).toHaveLength(2);
    expect(body.chapters[0]).toMatchObject({ chapterNumber: 1, title: "Part 1", audioUrl: "/c1.mp3", durationSeconds: 42 });
    expect(body.chapters[0].timing).toEqual(timing);
    expect(body.chapters[1].timing).toBeNull();
  });
});

describe("POST /api/narration/:bookId/generate — validation", () => {
  it("401 when the request has no user", async () => {
    const { baseUrl } = await setup({ noUser: true });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(401);
  });

  it("503 when ElevenLabs is not configured", async () => {
    const { baseUrl } = await setup({ elevenConfigured: false });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(503);
  });

  it("400 for an unsupported voiceId", async () => {
    const { baseUrl } = await setup();
    const res = await generate(baseUrl, "book-1", { voiceId: "not-a-real-voice" });
    expect(res.status).toBe(400);
  });

  it("404 when the book does not exist", async () => {
    const { baseUrl } = await setup({ book: null });
    const res = await generate(baseUrl, "missing");
    expect(res.status).toBe(404);
  });

  it("400 when the title is not a text format", async () => {
    const { baseUrl } = await setup({ book: { id: "book-1", title: "Pod", contentType: "audiobook" } });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(400);
  });

  it("returns cached completed without consuming quota when assets already exist", async () => {
    const { baseUrl, incrementAiAddonUsage } = await setup({
      seedAssets: [
        { bookId: "book-1", voiceId: RACHEL, chapterNumber: 1, title: "Part 1", audioUrl: "/a1.mp3", durationSeconds: 10, timingJson: null },
      ],
    });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "completed", cached: true });
    expect(incrementAiAddonUsage).not.toHaveBeenCalled();
  });

  it("402 with an upsell payload when the AI add-on quota is exhausted", async () => {
    const { baseUrl } = await setup({ addonAllowed: false });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgradeRequired).toBe(true);
  });

  it("422 when no readable text can be fetched", async () => {
    const { baseUrl } = await setup({ ebook: { status: 404 } });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(422);
  });

  it("422 when only a non-narratable sample is available", async () => {
    const { baseUrl } = await setup({ ebook: { sample: true } });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(422);
  });
});

describe("POST /api/narration/:bookId/generate — job lifecycle", () => {
  it("queues a job, runs it to completion, and consumes one credit", async () => {
    const { baseUrl, state, incrementAiAddonUsage, save } = await setup({ tts: "ok" });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({ status: "queued", totalChapters: 1 });

    await waitFor(() => state.jobs[0]?.status === "completed");
    expect(state.jobs[0].completedChapters).toBe(1);
    expect(state.assets).toHaveLength(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(incrementAiAddonUsage).toHaveBeenCalledTimes(1);
  });

  it("marks the job 'failed' with a user-facing error when synthesis fails on the first chapter", async () => {
    const { baseUrl, state } = await setup({ tts: "throw" });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(202); // accepted, then fails in the background

    await waitFor(() => state.jobs[0]?.status === "failed");
    expect(state.jobs[0].error).toBeTruthy();
    expect(state.assets).toHaveLength(0);

    // The failure must be observable to the client via the status endpoint.
    const statusRes = await fetch(`${baseUrl}/api/narration/book-1/status?voiceId=${RACHEL}`);
    const statusBody = await statusRes.json();
    expect(statusBody.status).toBe("failed");
    expect(typeof statusBody.error).toBe("string");
    expect(statusBody.error.length).toBeGreaterThan(0);
  });

  it("keeps the completed chapter and fails the job when a LATER chapter's synthesis fails mid-book", async () => {
    const { baseUrl, state, save, ttsWithTs } = await setup({
      tts: "fail-second",
      ebook: { content: TWO_CHAPTER_TEXT },
    });
    const res = await generate(baseUrl, "book-1");
    expect(res.status).toBe(202); // accepted, then fails partway through

    await waitFor(() => state.jobs[0]?.status === "failed");

    // Chapter 1 finished (asset persisted, progress counted) BEFORE chapter 2 failed:
    // the job records partial progress and does NOT silently report success.
    expect(state.jobs[0].totalChapters).toBe(2);
    expect(state.jobs[0].completedChapters).toBe(1);
    expect(state.jobs[0].error).toBeTruthy();
    expect(state.assets).toHaveLength(1);
    expect(state.assets[0].chapterNumber).toBe(1);
    expect(save).toHaveBeenCalledTimes(1); // only chapter 1's audio was stored
    expect(ttsWithTs).toHaveBeenCalledTimes(2); // attempted both chapters

    // The partial failure is observable to the client via the status endpoint.
    const statusRes = await fetch(`${baseUrl}/api/narration/book-1/status?voiceId=${RACHEL}`);
    const statusBody = await statusRes.json();
    expect(statusBody.status).toBe("failed");
    expect(statusBody.completedChapters).toBe(1);
    expect(statusBody.totalChapters).toBe(2);
    expect(typeof statusBody.error).toBe("string");
    expect(statusBody.error.length).toBeGreaterThan(0);
  });
});

describe("POST /api/narration/:bookId/generate — concurrency caps", () => {
  it("429s a second concurrent job for the same user", async () => {
    const { baseUrl } = await setup({ tts: "hang" });
    const first = await generate(baseUrl, "book-1", { voiceId: RACHEL }, "user-a");
    expect(first.status).toBe(202);
    const second = await generate(baseUrl, "book-2", { voiceId: RACHEL }, "user-a");
    expect(second.status).toBe(429);
    const body = await second.json();
    expect(String(body.message)).toContain("already have a narration");
  });

  it("429s once the global concurrent-job cap is reached", async () => {
    const { baseUrl } = await setup({ tts: "hang" });
    const a = await generate(baseUrl, "book-1", { voiceId: RACHEL }, "user-a");
    const b = await generate(baseUrl, "book-2", { voiceId: RACHEL }, "user-b");
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    const c = await generate(baseUrl, "book-3", { voiceId: RACHEL }, "user-c");
    expect(c.status).toBe(429);
    const body = await c.json();
    expect(String(body.message)).toContain("busy");
  });
});
