/**
 * Unit tests for the Sensory Regulation Mode (Task #65) helpers.
 *
 * These cover the two behaviors required by the task spec but not
 * exercised by the API round-trip test in account-settings.test.ts:
 *   1. The .sensory-mode class is applied / removed on the root element.
 *   2. The Web Audio limiter chain is wired when sensoryMode is on,
 *      and bypassed (source -> destination only) when it is off.
 *
 * Run with: npx tsx tests/sensory-mode.test.ts
 */

import {
  applySensoryClass,
  bypassLimiter,
  connectLimiterChain,
  buildLimiterNodes,
  getAudioContextCtor,
} from "../client/src/contexts/sensory-audio";

// ─── Mock AudioContext + AudioNode ─────────────────────────────────────
type Connection = { from: string; to: string };

class MockAudioParam {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
}

class MockAudioNode {
  public name: string;
  public connections: Connection[] = [];
  constructor(name: string, public _log: Connection[]) {
    this.name = name;
  }
  connect(target: MockAudioNode) {
    const c = { from: this.name, to: target.name };
    this.connections.push(c);
    this._log.push(c);
    return target as unknown as AudioNode;
  }
  disconnect() {
    this.connections = [];
  }
}

class MockCompressor extends MockAudioNode {
  threshold = new MockAudioParam();
  knee = new MockAudioParam();
  ratio = new MockAudioParam();
  attack = new MockAudioParam();
  release = new MockAudioParam();
}

class MockGain extends MockAudioNode {
  gain = new MockAudioParam();
}

class MockAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  destination = new MockAudioNode("destination", this._log);
  constructor(public _log: Connection[] = []) {}
  createDynamicsCompressor() {
    return new MockCompressor("compressor", this._log);
  }
  createGain() {
    return new MockGain("gain", this._log);
  }
  createMediaElementSource() {
    return new MockAudioNode("source", this._log);
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

// ─── Mock document.documentElement ─────────────────────────────────────
class MockClassList {
  private set = new Set<string>();
  toggle(name: string, on?: boolean) {
    const want = on ?? !this.set.has(name);
    if (want) this.set.add(name);
    else this.set.delete(name);
    return want;
  }
  contains(name: string) {
    return this.set.has(name);
  }
}

// ─── Test runner ────────────────────────────────────────────────────────
const results: { name: string; passed: boolean; error?: string }[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: (e as Error).message });
  }
}

async function run() {
  // ── CSS class toggling ───────────────────────────────────────────────
  await test("applySensoryClass(root, true) adds .sensory-mode", () => {
    const cl = new MockClassList();
    const root = { classList: cl } as unknown as HTMLElement;
    const result = applySensoryClass(root, true);
    if (!result) throw new Error(`expected true, got ${result}`);
    if (!cl.contains("sensory-mode"))
      throw new Error(".sensory-mode was not added");
  });

  await test("applySensoryClass(root, false) removes .sensory-mode", () => {
    const cl = new MockClassList();
    cl.toggle("sensory-mode", true);
    const root = { classList: cl } as unknown as HTMLElement;
    const result = applySensoryClass(root, false);
    if (result) throw new Error(`expected false, got ${result}`);
    if (cl.contains("sensory-mode"))
      throw new Error(".sensory-mode was not removed");
  });

  // ── getAudioContextCtor uses standard AudioContext when present ──────
  await test("getAudioContextCtor returns the standard AudioContext", () => {
    const fakeWin = { AudioContext: MockAudioContext } as unknown as Window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const C = getAudioContextCtor(fakeWin);
    if (C !== (MockAudioContext as unknown as typeof AudioContext))
      throw new Error("expected MockAudioContext");
  });

  await test("getAudioContextCtor falls back to webkitAudioContext", () => {
    const fakeWin = {
      webkitAudioContext: MockAudioContext,
    } as unknown as Window & { webkitAudioContext?: typeof AudioContext };
    const C = getAudioContextCtor(fakeWin);
    if (C !== (MockAudioContext as unknown as typeof AudioContext))
      throw new Error("expected webkit fallback");
  });

  // ── Limiter chain ON: src -> compressor -> gain -> destination ───────
  await test("connectLimiterChain wires source through compressor and gain", () => {
    const log: Connection[] = [];
    const ctx = new MockAudioContext(log) as unknown as AudioContext;
    const src = new MockAudioNode("source", log) as unknown as AudioNode;
    const nodes = buildLimiterNodes(ctx);
    connectLimiterChain(ctx, src, nodes);

    const expected = [
      { from: "source", to: "compressor" },
      { from: "compressor", to: "gain" },
      { from: "gain", to: "destination" },
    ];
    for (const exp of expected) {
      if (!log.some((c) => c.from === exp.from && c.to === exp.to)) {
        throw new Error(
          `Missing connection ${exp.from} -> ${exp.to}. Got: ${JSON.stringify(log)}`,
        );
      }
    }
    // Critically: the source must NOT be wired straight to destination
    // when the limiter is engaged.
    if (log.some((c) => c.from === "source" && c.to === "destination")) {
      throw new Error("source bypassed limiter when it should be in-circuit");
    }
  });

  // ── Limiter chain OFF: src -> destination directly ───────────────────
  await test("bypassLimiter routes source straight to destination", () => {
    const log: Connection[] = [];
    const ctx = new MockAudioContext(log) as unknown as AudioContext;
    const src = new MockAudioNode("source", log) as unknown as AudioNode;
    const nodes = buildLimiterNodes(ctx);
    connectLimiterChain(ctx, src, nodes);

    // Reset the log so we only inspect the bypass step.
    log.length = 0;
    bypassLimiter(ctx, src, nodes);

    if (!log.some((c) => c.from === "source" && c.to === "destination")) {
      throw new Error(
        `Expected source -> destination after bypass. Got: ${JSON.stringify(log)}`,
      );
    }
    if (log.some((c) => c.from === "source" && c.to === "compressor")) {
      throw new Error(
        "Limiter still engaged after bypass — source still wired to compressor",
      );
    }
  });

  // ── Compressor parameters match the spec (-18 dB threshold, 4:1 ratio)
  await test("buildLimiterNodes sets the gentle peak-limiter parameters", () => {
    const ctx = new MockAudioContext() as unknown as AudioContext;
    const { compressor, gain } = buildLimiterNodes(ctx);
    const c = compressor as unknown as MockCompressor;
    const g = gain as unknown as MockGain;
    if (c.threshold.value !== -18)
      throw new Error(`threshold expected -18, got ${c.threshold.value}`);
    if (c.ratio.value !== 4)
      throw new Error(`ratio expected 4, got ${c.ratio.value}`);
    if (g.gain.value !== 0.85)
      throw new Error(`gain expected 0.85, got ${g.gain.value}`);
  });

  // ── Print results ────────────────────────────────────────────────────
  console.log("=== Sensory Mode Test Results ===");
  let passed = 0,
    failed = 0;
  for (const r of results) {
    if (r.passed) {
      console.log(`  PASS  ${r.name}`);
      passed++;
    } else {
      console.log(`  FAIL  ${r.name}`);
      console.log(`        ${r.error}`);
      failed++;
    }
  }
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
