import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const viteConfigSource = readFileSync(
  resolve(import.meta.dirname, "../../vite.config.ts"),
  "utf8",
);

test("vite dev proxy keeps only chat streams open for 24 hours", () => {
  assert.match(
    viteConfigSource,
    /\^\/api\/chat\/sessions\/\[\^\/\]\+\/stream\$[\s\S]*timeout: 86400000,/,
  );
  assert.match(viteConfigSource, /"\/api": \{[\s\S]*timeout: 300000,/);
});
