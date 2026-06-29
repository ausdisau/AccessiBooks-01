/**
 * check-cursor-rules
 *
 * Lightweight drift detector for `.cursor/rules/*.mdc`.
 *
 * The Cursor rule files duplicate stack/convention facts from `replit.md` and
 * `threat_model.md` (package names, file/dir paths). As the project evolves
 * those references can go stale and mislead Cursor's AI. This script scans the
 * rule files and fails if any referenced workspace package name or repo path no
 * longer exists, so the drift is caught instead of silently rotting.
 *
 * It is intentionally conservative: it only validates references it can resolve
 * unambiguously (tokens rooted at a known top-level dir, and `@workspace/*`
 * package names), and skips globs and editor-relative paths to avoid false
 * positives.
 *
 * Run: pnpm --filter @workspace/scripts run check:cursor-rules
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const rulesDir = join(repoRoot, ".cursor", "rules");

const TOP_DIRS = ["artifacts", "lib", "shared", "scripts"];

function collectWorkspacePackageNames(): Set<string> {
  const names = new Set<string>();
  const pkgDirs: string[] = [repoRoot, join(repoRoot, "scripts")];
  for (const group of ["artifacts", "lib"]) {
    const groupDir = join(repoRoot, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir)) {
      pkgDirs.push(join(groupDir, entry));
    }
  }
  for (const dir of pkgDirs) {
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
      if (pkg.name) names.add(pkg.name);
    } catch {
      // ignore unparseable package.json
    }
  }
  return names;
}

function extractPaths(text: string): Set<string> {
  const found = new Set<string>();
  // Negative lookbehind so a top-dir token preceded by a path char (e.g. the
  // `lib` in artifact-relative `src/lib/queryClient.ts`) is NOT treated as a
  // repo-root path.
  const re = new RegExp(
    `(?<![A-Za-z0-9._/-])(?:${TOP_DIRS.join("|")})\\/[A-Za-z0-9._/-]+`,
    "g",
  );
  for (const match of text.matchAll(re)) {
    let p = match[0];
    if (p.includes("*")) continue; // skip globs
    p = p.replace(/[./]+$/, ""); // strip trailing dots/slashes
    if (p) found.add(p);
  }
  return found;
}

function extractPackageRefs(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/@workspace\/[a-z0-9-]+/g)) {
    found.add(match[0]);
  }
  return found;
}

function main(): void {
  if (!existsSync(rulesDir)) {
    console.error(`No .cursor/rules directory found at ${rulesDir}`);
    process.exit(1);
  }
  const ruleFiles = readdirSync(rulesDir).filter((f) => f.endsWith(".mdc"));
  if (ruleFiles.length === 0) {
    console.error(`No .mdc rule files found in ${rulesDir}`);
    process.exit(1);
  }

  const knownPackages = collectWorkspacePackageNames();
  const problems: string[] = [];
  let checkedPaths = 0;
  let checkedPkgs = 0;

  for (const file of ruleFiles) {
    const text = readFileSync(join(rulesDir, file), "utf8");

    for (const p of extractPaths(text)) {
      checkedPaths++;
      const abs = join(repoRoot, p);
      if (!existsSync(abs)) {
        problems.push(`${file}: path no longer exists -> ${p}`);
      } else {
        // resolve symlink-free type just to ensure it's a real entry
        statSync(abs);
      }
    }

    for (const ref of extractPackageRefs(text)) {
      checkedPkgs++;
      if (!knownPackages.has(ref)) {
        problems.push(
          `${file}: workspace package not found -> ${ref} (known: ${[...knownPackages].sort().join(", ")})`,
        );
      }
    }
  }

  if (problems.length > 0) {
    console.error("Cursor rules drift detected:\n");
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `\n${problems.length} issue(s). Update the affected .cursor/rules/*.mdc files (and replit.md) to match the current code.`,
    );
    process.exit(1);
  }

  console.log(
    `OK: .cursor/rules in sync (${ruleFiles.length} files, ${checkedPaths} path refs, ${checkedPkgs} package refs validated).`,
  );
}

main();
