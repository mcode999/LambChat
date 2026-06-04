import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("loadHistory ignores stale async results instead of overwriting the active chat", () => {
  const source = readFileSync(resolve(__dirname, "../useAgent.ts"), "utf8");

  assert.match(source, /loadHistoryRequestIdRef/);
  assert.match(source, /isStaleHistoryLoad/);
  assert.match(source, /loadHistoryRequestIdRef\.current \+= 1/);
});
