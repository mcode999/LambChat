import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const usersPanelSource = readFileSync(
  join(import.meta.dirname, "../UsersPanel.tsx"),
  "utf8",
);

const componentsCss = readFileSync(
  join(import.meta.dirname, "../../../styles/components.css"),
  "utf8",
);

test("user form icon inputs use shared Input leading icon spacing", () => {
  const leadingIconMatches = usersPanelSource.match(/leadingIcon=\{/g);

  assert.equal(leadingIconMatches?.length, 3);
  assert.match(usersPanelSource, /import \{[\s\S]*Input[\s\S]*\}/);
  assert.doesNotMatch(usersPanelSource, /className="glass-input/);
  assert.match(
    componentsCss,
    /\.ui-input--with-leading-icon[\s\S]*?\.glass-input\.es-input\.es-input--with-leading-icon\s*\{[\s\S]*padding-left:\s*2\.5rem;/,
  );
});
