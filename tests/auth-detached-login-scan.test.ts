/**
 * Static regression scan for the "detached req.logIn / req.login" anti-pattern
 * (Task #148, follow-up to Task #146).
 *
 * Background: passport's `req.logIn` (alias `req.login`) writes the user into
 * the session via `this._sessionManager`. If a route handler captures it as
 * a bare reference and calls it without `this`, the session-write step is
 * silently skipped — the callback fires with no error, the redirect appears
 * to succeed, but no cookie is ever set. This bug shipped once in
 * server/auth0CallbackHandler.ts (Task #146) and we want to make it impossible
 * to reintroduce in any future provider added under server/auth*.ts or
 * server/multiAuth.ts without the scan tripping.
 *
 * Strategy — two complementary scans:
 *
 *   1. Find every read of `.logIn` / `.login` whose *receiver expression*
 *      textually contains the identifier `req` (covers `req.logIn`,
 *      `(req as Request & { logIn?: unknown }).logIn`, `(req as any).logIn`,
 *      `(<any>req).logIn`, `req?.logIn`, etc). If the read is not one of
 *      the four safe forms below, locate the captured variable name and
 *      require that *that exact symbol* later gets `.bind(<reqName>)`-ed
 *      somewhere in the file. Otherwise the access is flagged.
 *
 *      Safe forms (not flagged):
 *        a. Direct call         `req.logIn(user, cb)`
 *        b. Inline bind         `req.logIn.bind(req)`
 *        c. Override assignment `(req as any).logIn = (...)`  (test seeders)
 *        d. Type-position only  `req.logIn?:`  /  `req.logIn:`
 *
 *   2. Find every destructuring of `logIn` / `login` from a `req`-like
 *      receiver (`const { logIn } = req`). The captured symbol is the
 *      identifier itself; require it to be `.bind(req)`-ed later or flag.
 *
 * Two negative self-tests pin the scanner so it can't silently regress to
 * "always passes":
 *   - a casted detached pattern MUST be flagged
 *   - a nearby-but-unrelated `.bind(req)` MUST NOT be treated as safe
 *
 * The reference safe form lives in server/auth0CallbackHandler.ts:
 *   const candidate = (req as Request & { logIn?: unknown }).logIn;
 *   ...
 *   return (candidate as (...args: unknown[]) => unknown).bind(req) as LogInFn;
 *
 * Run: npx tsx tests/auth-detached-login-scan.test.ts
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type Result = { name: string; passed: boolean; error?: string };
const results: Result[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const SERVER_DIR = join(__dirname, "..", "server");

/**
 * Replace the contents of `// line comments`, `/* block comments *​/`,
 * and string literals (`"..."`, `'...'`, backtick template literals) with
 * spaces — preserving line numbers and column offsets — so the scanner
 * doesn't fire on `req.logIn` mentioned inside a doc comment or an error
 * message string. We don't need a full TS parser for this; a small
 * single-pass state machine is enough to handle the call sites that
 * actually appear in server/*.ts.
 *
 * Limitations (acceptable for the scan):
 *  - Doesn't fully parse template-literal `${...}` expressions; the
 *    interpolated code is also blanked. That's safe — we'd rather
 *    under-flag inside a template than risk a false positive.
 *  - Doesn't handle JSX text (no .ts file under server/ has JSX).
 */
function stripCommentsAndStrings(src: string): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    // Line comment
    if (ch === "/" && next === "/") {
      out.push("//");
      i += 2;
      while (i < n && src[i] !== "\n") {
        out.push(src[i] === "\n" ? "\n" : " ");
        i++;
      }
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      out.push("/*");
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out.push(src[i] === "\n" ? "\n" : " ");
        i++;
      }
      if (i < n) {
        out.push("*/");
        i += 2;
      }
      continue;
    }
    // String literal
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out.push(quote);
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          out.push(src[i + 1] === "\n" ? "\n " : "  ");
          i += 2;
          continue;
        }
        out.push(src[i] === "\n" ? "\n" : " ");
        i++;
      }
      if (i < n) {
        out.push(quote);
        i++;
      }
      continue;
    }
    out.push(ch);
    i++;
  }
  return out.join("");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * Walk backwards from `idx` over a balanced parenthesis chain so that
 * `(req as any).logIn` and `((req as Request & { logIn?: unknown })).logIn`
 * both yield "(req as any)" / "((req as ...))" as the receiver text.
 *
 * Returns the start index of the receiver expression on the same line
 * (we never cross newlines so a malformed file can't produce a runaway
 * walk). If the immediate predecessor is just an identifier (e.g. `req`
 * or `candidate`), we walk back over identifier characters instead.
 */
function findReceiverStart(source: string, dotIdx: number): number {
  const lineStart = source.lastIndexOf("\n", dotIdx) + 1;
  // Skip optional `?` (for `req?.logIn`)
  let i = dotIdx - 1;
  while (i >= lineStart && /\s/.test(source[i])) i--;
  if (i >= lineStart && source[i] === "?") i--;
  // Skip whitespace again
  while (i >= lineStart && /\s/.test(source[i])) i--;

  if (i < lineStart) return lineStart;

  if (source[i] === ")") {
    // Walk back balanced parens to the matching "("
    let depth = 1;
    i--;
    while (i >= lineStart && depth > 0) {
      if (source[i] === ")") depth++;
      else if (source[i] === "(") depth--;
      if (depth > 0) i--;
    }
    return Math.max(i, lineStart);
  }

  // Identifier / member-chain receiver — walk back over [\w.] characters
  while (i >= lineStart && /[\w$.]/.test(source[i])) i--;
  return i + 1;
}

/**
 * Given an unsafe `.logIn` / `.login` access, find the variable that
 * captured it (so we can verify that *specific* symbol is later bound).
 *
 * Captures we recognise:
 *   const NAME = <expr>.logIn        →  NAME
 *   let   NAME = <expr>.logIn        →  NAME
 *   var   NAME = <expr>.logIn        →  NAME
 *   return <expr>.logIn              →  null  (returned out — caller's problem;
 *                                              flag conservatively)
 *   <bare expression statement>      →  null  (dead read — flag conservatively)
 */
function findCapturedName(
  source: string,
  receiverStart: number,
): string | null {
  const lineStart = source.lastIndexOf("\n", receiverStart) + 1;
  const prefix = source.slice(lineStart, receiverStart);
  // Look for `const|let|var NAME (: type)? =` at the start of the line
  // (allow leading whitespace).
  const m = prefix.match(/^\s*(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?\s*=\s*$/);
  if (m) return m[1];
  return null;
}

/**
 * Returns true iff the captured symbol `name` is `.bind(<reqLike>)`-ed
 * somewhere after `fromIdx` in `source`. `<reqLike>` must be an
 * identifier whose name contains "req" (case-insensitive) — covers
 * the common `req`, `request`, `httpReq`, `expressReq`, etc. without
 * accepting `.bind(somethingElse)` as proof of safety. A literal,
 * number, or unrelated identifier no longer satisfies the check.
 */
function isSymbolBoundLater(
  source: string,
  name: string,
  fromIdx: number,
): boolean {
  const tail = source.slice(fromIdx);
  // Allow an arbitrary cast / parenthesisation between the symbol and
  // .bind, e.g. `(candidate as (...args: unknown[]) => unknown).bind(req)`.
  // We anchor on the symbol name + a `.bind(<reqLike>)` somewhere on the
  // same logical expression (no `;` between them).
  const re = new RegExp(
    `\\b${name}\\b[^;]*?\\.bind\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*[),]`,
  );
  let m: RegExpExecArray | null;
  // Use a global walk so we keep scanning past a non-matching first hit.
  const reG = new RegExp(re.source, "g");
  while ((m = reG.exec(tail)) !== null) {
    if (/req/i.test(m[1])) return true;
  }
  return false;
}

interface Offender {
  file: string;
  line: number;
  text: string;
  reason: string;
}

function scanFile(file: string): Offender[] {
  const raw = readFileSync(file, "utf8");
  const source = stripCommentsAndStrings(raw);
  const offenders: Offender[] = [];
  // Use raw lines for the human-readable error preview so the operator
  // sees the original code (not the blanked version).
  const lines = raw.split("\n");

  // ── Scan 1: any `.logIn` / `.login` access whose receiver mentions `req`.
  const accessRe = /\.log[Ii]n\b/g;
  let m: RegExpExecArray | null;
  while ((m = accessRe.exec(source)) !== null) {
    const dotIdx = m.index;
    const after = source.slice(dotIdx + m[0].length);

    // Safe form (a): direct method call — `.logIn(`
    if (/^\s*\(/.test(after)) continue;
    // Safe form (b): inline bind — `.logIn.bind(`
    if (/^\s*\.bind\s*\(/.test(after)) continue;
    // Safe form (c): override / property write — `.logIn =` (but not `==`)
    if (/^\s*=(?!=)/.test(after)) continue;
    // Safe form (d): type position — `.logIn?:` or `.logIn:`
    if (/^\s*[?:]/.test(after)) continue;

    // Receiver must textually contain the identifier `req`. This is what
    // makes the scan robust to casts like `(req as Request & ...).logIn`,
    // `(req as any).logIn`, `(<any>req).logIn`, `req?.logIn`, etc.
    const receiverStart = findReceiverStart(source, dotIdx);
    const receiverText = source.slice(receiverStart, dotIdx);
    if (!/\breq\b/.test(receiverText)) continue;

    // Try to identify the captured variable name. If we find one, verify
    // *it specifically* is `.bind(<ident>)`-ed later in the file. A nearby
    // unrelated `.bind(req)` must NOT be treated as safe.
    const capturedName = findCapturedName(source, receiverStart);
    if (capturedName && isSymbolBoundLater(source, capturedName, dotIdx)) {
      continue;
    }

    const lineNo = source.slice(0, dotIdx).split("\n").length;
    offenders.push({
      file,
      line: lineNo,
      text: lines[lineNo - 1].trim(),
      reason: capturedName
        ? `captured into '${capturedName}' but never .bind(req)-ed`
        : "detached read of req.logIn / req.login (no capture, no call, no bind)",
    });
  }

  // ── Scan 2: destructuring — `const { logIn } = req` (or casted req).
  const destructRe =
    /(?:const|let|var)\s*\{\s*([^}]*\blog[Ii]n\b[^}]*)\}\s*=\s*([^;\n]+)/g;
  while ((m = destructRe.exec(source)) !== null) {
    const rhs = m[2];
    if (!/\breq\b/.test(rhs)) continue;
    // Captured symbol is `logIn` (or `login`, or whatever alias appears
    // after `:` in the destructure). Pull the actual local name.
    const inner = m[1];
    // Match `logIn` / `login` optionally aliased: `logIn: alias`. Use a
    // capture group for the bare name so we don't accidentally absorb
    // trailing whitespace from `\s*` into the local-name string (which
    // would then break the `\b<name>\b` later-bound regex).
    const nameMatch = inner.match(/\b(log[Ii]n)\b\s*(?::\s*(\w+))?/);
    const localName = nameMatch?.[2] ?? nameMatch?.[1];
    if (!localName) continue;
    if (isSymbolBoundLater(source, localName, m.index + m[0].length)) continue;

    const lineNo = source.slice(0, m.index).split("\n").length;
    offenders.push({
      file,
      line: lineNo,
      text: lines[lineNo - 1].trim(),
      reason: `destructured '${localName}' from req but never .bind(req)-ed`,
    });
  }

  return offenders;
}

function formatOffenders(offenders: Offender[]): string {
  return offenders
    .map(
      (o) =>
        `  ${relative(process.cwd(), o.file)}:${o.line}  [${o.reason}]\n` +
        `      ${o.text}`,
    )
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Production scan
// ─────────────────────────────────────────────────────────────────────────

test(
  "no server/*.ts file captures req.logIn / req.login without .bind(req)",
  () => {
    const files = walk(SERVER_DIR);
    assert(files.length > 0, "expected to find server/*.ts files");

    const all: Offender[] = [];
    for (const f of files) all.push(...scanFile(f));

    if (all.length > 0) {
      throw new Error(
        "Detached req.logIn / req.login capture(s) found — passport's " +
          "session-write requires `this`, so any captured reference must " +
          "be `.bind(req)`-ed (see server/auth0CallbackHandler.ts for the " +
          "reference fix). Offending sites:\n" +
          formatOffenders(all),
      );
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Self-tests — exercise the scanner against synthetic snippets so that
// passing the production scan above actually means something. Each
// snippet is fed through scanFile() via a temp path read from memory.
// We monkey-patch readFileSync only inside helpers below.
// ─────────────────────────────────────────────────────────────────────────

function scanSource(rawSource: string): Offender[] {
  // Reuse scanFile by inlining its body against an in-memory string.
  const source = stripCommentsAndStrings(rawSource);
  const offenders: Offender[] = [];
  const lines = rawSource.split("\n");

  const accessRe = /\.log[Ii]n\b/g;
  let m: RegExpExecArray | null;
  while ((m = accessRe.exec(source)) !== null) {
    const dotIdx = m.index;
    const after = source.slice(dotIdx + m[0].length);
    if (/^\s*\(/.test(after)) continue;
    if (/^\s*\.bind\s*\(/.test(after)) continue;
    if (/^\s*=(?!=)/.test(after)) continue;
    if (/^\s*[?:]/.test(after)) continue;

    const receiverStart = findReceiverStart(source, dotIdx);
    const receiverText = source.slice(receiverStart, dotIdx);
    if (!/\breq\b/.test(receiverText)) continue;

    const capturedName = findCapturedName(source, receiverStart);
    if (capturedName && isSymbolBoundLater(source, capturedName, dotIdx)) {
      continue;
    }
    const lineNo = source.slice(0, dotIdx).split("\n").length;
    offenders.push({
      file: "<inline>",
      line: lineNo,
      text: lines[lineNo - 1].trim(),
      reason: capturedName
        ? `captured into '${capturedName}' but never .bind(req)-ed`
        : "detached read",
    });
  }

  const destructRe =
    /(?:const|let|var)\s*\{\s*([^}]*\blog[Ii]n\b[^}]*)\}\s*=\s*([^;\n]+)/g;
  while ((m = destructRe.exec(source)) !== null) {
    const rhs = m[2];
    if (!/\breq\b/.test(rhs)) continue;
    const inner = m[1];
    const nameMatch = inner.match(/\b(log[Ii]n)\b\s*(?::\s*(\w+))?/);
    const localName = nameMatch?.[2] ?? nameMatch?.[1];
    if (!localName) continue;
    if (isSymbolBoundLater(source, localName, m.index + m[0].length)) continue;
    const lineNo = source.slice(0, m.index).split("\n").length;
    offenders.push({
      file: "<inline>",
      line: lineNo,
      text: lines[lineNo - 1].trim(),
      reason: `destructured '${localName}'`,
    });
  }
  return offenders;
}

test("self-test: plain `const fn = req.logIn` is flagged", () => {
  const src = `function h(req: any) {
  const fn = req.logIn;
  fn(user, () => {});
}`;
  const off = scanSource(src);
  assert(
    off.length === 1,
    `expected 1 offender, got ${off.length}: ${JSON.stringify(off)}`,
  );
});

test("self-test: casted `const fn = (req as Request & {...}).logIn` is flagged", () => {
  // This is the EXACT shape of the original Task #146 bug — and the
  // exact shape the previous version of this scanner missed.
  const src = `function h(req: any) {
  const fn = (req as Request & { logIn?: unknown }).logIn;
  if (typeof fn === "function") fn(user, () => {});
}`;
  const off = scanSource(src);
  assert(
    off.length === 1,
    `expected casted form to be flagged, got ${off.length}: ${JSON.stringify(off)}`,
  );
});

test("self-test: `(req as any).logIn` is flagged", () => {
  const src = `function h(req: any) {
  const x = (req as any).logIn;
  x(user, cb);
}`;
  const off = scanSource(src);
  assert(off.length === 1, `expected (req as any).logIn flagged, got ${off.length}`);
});

test("self-test: `req?.logIn` (optional chain) is flagged", () => {
  const src = `function h(req: any) {
  const x = req?.logIn;
  x?.(user, cb);
}`;
  const off = scanSource(src);
  assert(off.length === 1, `expected req?.logIn flagged, got ${off.length}`);
});

test("self-test: `.bind(somethingElse)` does NOT count as proof of safety", () => {
  // Even if the captured symbol is bind-ed, binding to a non-request
  // identifier doesn't restore passport's `this._sessionManager`. The
  // scanner must still flag this case.
  const src = `function h(req: any) {
  const fn = req.logIn;
  const wrong = fn.bind(somethingElse);
  wrong(user, () => {});
}`;
  const off = scanSource(src);
  assert(
    off.length === 1,
    `bind to non-req identifier must NOT be treated as safe, got ${off.length}`,
  );
});

test("self-test: nearby-but-unrelated `.bind(req)` does NOT mask the bug", () => {
  // The PREVIOUS version of this scanner used a 5-line window and would
  // wrongly treat any `.bind(req)` in that window as proof of safety —
  // even when the bind was on a different symbol entirely.
  const src = `function h(req: any) {
  const fn = req.logIn;
  // unrelated nearby bind on a sibling helper
  const noop = (() => {}).bind(req);
  fn(user, () => {});
}`;
  const off = scanSource(src);
  assert(
    off.length === 1,
    "scanner falsely treated an unrelated .bind(req) as proof that fn was bound",
  );
});

test("self-test: direct call `req.logIn(user, cb)` is NOT flagged", () => {
  const src = `function h(req: any) {
  req.logIn(user, () => {});
}`;
  assert(scanSource(src).length === 0, "direct method call must be safe");
});

test("self-test: inline bind `req.logIn.bind(req)` is NOT flagged", () => {
  const src = `function h(req: any) {
  const fn = req.logIn.bind(req);
  fn(user, () => {});
}`;
  assert(scanSource(src).length === 0, "inline .bind(req) must be safe");
});

test("self-test: capture + later `candidate.bind(req)` is NOT flagged (canonical fix)", () => {
  // Mirrors server/auth0CallbackHandler.ts — the production safe form.
  const src = `function getReqLogIn(req: any) {
  const candidate = (req as Request & { logIn?: unknown }).logIn;
  if (typeof candidate !== "function") return undefined;
  return (candidate as (...args: unknown[]) => unknown).bind(req);
}`;
  const off = scanSource(src);
  assert(
    off.length === 0,
    `canonical safe form was wrongly flagged: ${JSON.stringify(off)}`,
  );
});

test("self-test: override `(req as any).logIn = (...)` is NOT flagged (test seeders)", () => {
  const src = `app.use((req, _res, next) => {
  (req as any).logIn = (_u: unknown, done: (e?: unknown) => void) => done();
  next();
});`;
  assert(
    scanSource(src).length === 0,
    "test-seeder property override must not be flagged",
  );
});

test("self-test: type-position `logIn?:` in an interface is NOT flagged", () => {
  // Matches receivers that contain `req`-the-substring inside type
  // declarations like `Request & { logIn?: ... }`.
  const src = `type X = Request & { logIn?: (u: unknown, cb: any) => void };`;
  assert(
    scanSource(src).length === 0,
    "type-position logIn?: declaration must not be flagged",
  );
});

test("self-test: destructured `const { logIn } = req` is flagged", () => {
  const src = `function h(req: any) {
  const { logIn } = req;
  logIn(user, () => {});
}`;
  const off = scanSource(src);
  assert(off.length === 1, `destructure must be flagged, got ${off.length}`);
});

test("self-test: destructured `const { logIn } = req` + later `logIn.bind(req)` is NOT flagged", () => {
  const src = `function h(req: any) {
  const { logIn } = req;
  const safe = logIn.bind(req);
  safe(user, () => {});
}`;
  assert(
    scanSource(src).length === 0,
    "destructure with later .bind(req) on the same symbol must be safe",
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.passed);
console.log(
  `\nauth-detached-login-scan: ${results.length - failed.length}/${results.length} passed\n`,
);
for (const r of results) {
  console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.passed) console.log(`        ${r.error}`);
}
if (failed.length > 0) process.exit(1);
