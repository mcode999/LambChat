import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("app shell reserves native mobile status bar safe area", () => {
  const shell = readSource("../AppShell.tsx");
  const tokens = readSource("../../../../styles/tokens.css");

  assert.match(
    tokens,
    /--app-safe-area-top:\s*env\(safe-area-inset-top, 0px\)/,
  );
  assert.match(shell, /boxSizing:\s*"content-box"/);
  assert.match(shell, /paddingTop:\s*"var\(--app-safe-area-top, 0px\)"/);
  assert.match(shell, /paddingBottom:\s*"var\(--app-safe-area-bottom, 0px\)"/);
  assert.match(
    shell,
    /height:\s*"calc\(var\(--app-viewport-height, 100dvh\) - var\(--app-safe-area-top, 0px\) - var\(--app-safe-area-bottom, 0px\)\)"/,
  );
});
