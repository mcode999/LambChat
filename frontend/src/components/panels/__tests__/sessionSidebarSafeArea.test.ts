import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, "../SessionSidebar.tsx"),
  "utf8",
);

test("mobile sidebar overlay starts below the iOS safe-area top inset", () => {
  const overlayBlock = source.match(
    /className=\{`fixed left-0 right-0 z-\[60\][\s\S]*?style=\{\{(?<style>[\s\S]*?)\}\}/,
  )?.groups?.style;

  assert.ok(overlayBlock, "mobile overlay block should be present");
  assert.match(overlayBlock, /top:\s*"env\(safe-area-inset-top\)"/);
  assert.match(
    overlayBlock,
    /height:\s*"calc\(var\(--app-viewport-height, 100dvh\) - env\(safe-area-inset-top\)\)"/,
  );
});

test("mobile sidebar panel starts below the iOS safe-area top inset", () => {
  const panelBlock = source.match(
    /className=\{`rounded-r-lg fixed left-0[\s\S]*?style=\{\{(?<style>[\s\S]*?)\}\}/,
  )?.groups?.style;

  assert.ok(panelBlock, "mobile sidebar panel block should be present");
  assert.match(panelBlock, /top:\s*"env\(safe-area-inset-top\)"/);
  assert.match(
    panelBlock,
    /height:\s*"calc\(var\(--app-viewport-height, 100dvh\) - env\(safe-area-inset-top\)\)"/,
  );
  assert.doesNotMatch(panelBlock, /paddingTop:\s*"env\(safe-area-inset-top\)"/);
});
