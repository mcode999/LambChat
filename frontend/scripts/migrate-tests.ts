#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const scope = args.find((a) => !a.startsWith("--")) ?? ".";

console.log(
  apply
    ? "==> APPLY mode — files will be moved and rewritten"
    : "==> DRY-RUN mode — no files will be changed (pass --apply to execute)",
);
console.log(`    Scope: ${scope}\n`);

function findTestFiles(root: string): string[] {
  const results: string[] = [];
  const skip = new Set(["node_modules", "__tests__", ".git"]);

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
        results.push(full);
      }
    }
  }

  walk(path.resolve(root));
  return results.sort();
}

function fixImports(filePath: string, content: string): string {
  return content.replace(
    /from\s+(['"])(\.+\/)/g,
    (_match, quote: string, relPath: string) => `from ${quote}../${relPath}`,
  );
}

function showDiff(original: string, rewritten: string, filePath: string) {
  const origLines = original.split("\n");
  const newLines = rewritten.split("\n");
  const diffs: string[] = [];

  for (let i = 0; i < Math.max(origLines.length, newLines.length); i++) {
    if (origLines[i] !== newLines[i]) {
      diffs.push(`- ${origLines[i] ?? ""}\n+ ${newLines[i] ?? ""}`);
    }
  }

  if (diffs.length > 0) {
    console.log(`  [import rewrite] ${filePath}`);
    for (const d of diffs.slice(0, 10)) console.log(d);
    if (diffs.length > 10) console.log(`  ... and ${diffs.length - 10} more`);
  }
}

const testFiles = findTestFiles(scope);

if (testFiles.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

console.log(`Found ${testFiles.length} test file(s).\n`);

let moved = 0;
let skipped = 0;

for (const testFile of testFiles) {
  const dir = path.dirname(testFile);
  const base = path.basename(testFile);
  const targetDir = path.join(dir, "__tests__");
  const targetFile = path.join(targetDir, base);

  if (path.basename(dir) === "__tests__") {
    console.log(`  SKIP (already in __tests__): ${testFile}`);
    skipped++;
    continue;
  }

  console.log(`  ${testFile}`);
  console.log(`    -> ${targetFile}`);

  const content = fs.readFileSync(testFile, "utf-8");
  const rewritten = fixImports(testFile, content);

  if (apply) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, rewritten);
    fs.unlinkSync(testFile);
  } else {
    showDiff(content, rewritten, testFile);
  }

  moved++;
}

console.log();
if (apply) {
  console.log(`Done. Moved ${moved} file(s), skipped ${skipped}.`);
} else {
  console.log(
    `Dry-run complete. ${moved} file(s) would be moved, ${skipped} skipped.`,
  );
  console.log("Run with --apply to execute.");
}
