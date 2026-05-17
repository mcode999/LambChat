import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../FeatureMenu.tsx", import.meta.url),
  "utf8",
);

test("feature menu renders boolean agent options in the settings group", () => {
  assert.match(source, /const booleanOptionEntries = Object\.entries/);
  assert.match(
    source,
    /\(hasAgentSelector \|\|[\s\S]*hasThinkingOption \|\|[\s\S]*booleanOptionEntries\.length > 0\)/,
  );
  assert.match(source, /booleanOptionEntries\.map\(\(\[key, option\]\)/);
  assert.match(source, /onToggleAgentOption\?\.\(key, !enabled\)/);
});
