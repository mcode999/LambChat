import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("block image skeleton overlays the image while loading to avoid extra blank space", () => {
  const source = readFileSync(
    new URL("../ImageWithSkeleton.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /className=\{`relative my-2 overflow-hidden rounded-lg shadow/,
    "The block image wrapper should remain the single layout box.",
  );
  assert.match(
    source,
    /className="skeleton-line w-full rounded-lg"/,
    "The block skeleton should provide the loading layout box.",
  );
  assert.match(
    source,
    /className=\{`\s*\$\{\s*!isLoaded \? "absolute inset-0 pointer-events-none" : ""\s*\}/s,
    "The block image should be removed from document flow while the skeleton is visible.",
  );
});

test("image rendering keeps upload URLs web-compatible instead of forcing native proxy mode", () => {
  const source = readFileSync(
    new URL("../ImageWithSkeleton.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /getFullUrl/);
  assert.doesNotMatch(source, /buildUploadProxyUrl/);
});
