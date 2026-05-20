import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../modelIcon.ts", import.meta.url),
  "utf8",
);
const componentSource = readFileSync(
  new URL("../modelIcon.tsx", import.meta.url),
  "utf8",
);

test("model icon resolver accepts an explicit icon before provider fallback", () => {
  assert.match(source, /explicitIcon\?:\s*string/);
  assert.match(
    source,
    /if\s*\(\s*explicitIcon\s*&&\s*providerMap\[explicitIcon\]\s*\)/,
  );
  assert.match(componentSource, /icon\?:\s*string/);
  assert.match(componentSource, /getModelIconUrl\(model,\s*provider,\s*icon\)/);
});
