/**
 * Pure helpers for the Sensory Regulation Mode (Task #65) audio limiter.
 *
 * These are split out of AudioContext.tsx so they can be unit-tested with
 * a mocked AudioContext + mocked Document, without spinning up React.
 */

interface WindowWithLegacyAudio extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Returns the constructor for AudioContext, falling back to the
 * webkit-prefixed legacy form. Returns null when Web Audio is unsupported.
 */
export function getAudioContextCtor(
  win: WindowWithLegacyAudio | undefined = typeof window === "undefined" ? undefined : (window as WindowWithLegacyAudio),
): typeof AudioContext | null {
  if (!win) return null;
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

export interface LimiterNodes {
  compressor: DynamicsCompressorNode;
  gain: GainNode;
}

/**
 * Build a gentle peak limiter (DynamicsCompressor + soft Gain) tuned to
 * catch loud spikes (ad cues, chapter intros) without obvious pumping.
 */
export function buildLimiterNodes(ctx: AudioContext): LimiterNodes {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, ctx.currentTime);
  compressor.knee.setValueAtTime(12, ctx.currentTime);
  compressor.ratio.setValueAtTime(4, ctx.currentTime);
  compressor.attack.setValueAtTime(0.003, ctx.currentTime);
  compressor.release.setValueAtTime(0.25, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.85, ctx.currentTime);

  return { compressor, gain };
}

/**
 * Wire the source through compressor -> gain -> destination.
 * Existing connections on these nodes are torn down first.
 */
export function connectLimiterChain(
  ctx: AudioContext,
  src: AudioNode,
  nodes: LimiterNodes,
): void {
  src.disconnect();
  nodes.compressor.disconnect();
  nodes.gain.disconnect();
  src.connect(nodes.compressor);
  nodes.compressor.connect(nodes.gain);
  nodes.gain.connect(ctx.destination);
}

/**
 * Bypass the limiter: route the source straight to destination.
 * The compressor and gain are disconnected but kept alive so we can
 * re-engage the chain instantly if the user toggles the mode back on.
 */
export function bypassLimiter(
  ctx: AudioContext,
  src: AudioNode,
  nodes: LimiterNodes | null,
): void {
  src.disconnect();
  if (nodes) {
    nodes.compressor.disconnect();
    nodes.gain.disconnect();
  }
  src.connect(ctx.destination);
}

/**
 * Toggle the .sensory-mode class on the given root element. Returns
 * the new boolean state, so tests can assert behaviour without poking
 * at classList directly.
 */
export function applySensoryClass(root: HTMLElement, on: boolean): boolean {
  root.classList.toggle("sensory-mode", on);
  return root.classList.contains("sensory-mode");
}
