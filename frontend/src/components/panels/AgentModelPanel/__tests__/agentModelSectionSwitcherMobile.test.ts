import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(
  new URL("../AgentModelPanel.tsx", import.meta.url),
  "utf8",
);
const componentsCss = readFileSync(
  new URL("../../../../styles/components.css", import.meta.url),
  "utf8",
);

test("agent model section switcher keeps a compact segmented layout in the mobile header menu", () => {
  assert.match(panelSource, /agent-model-section-switcher/);
  assert.match(
    componentsCss,
    /\.panel-header__mobile-menu-item > \.agent-model-section-switcher\s*\{[\s\S]*?display:\s*grid;[\s\S]*?width:\s*min\(18rem,\s*calc\(100vw - 2rem\)\);/,
  );
  assert.match(
    componentsCss,
    /\.panel-header__mobile-menu-item > \.agent-model-section-switcher > button\s*\{[\s\S]*?height:\s*2\.625rem;[\s\S]*?justify-content:\s*center;/,
  );
  assert.match(
    componentsCss,
    /\.panel-header__mobile-menu-item[\s\S]*?> \.agent-model-section-switcher[\s\S]*?> button[\s\S]*?> span\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;/,
  );
});
