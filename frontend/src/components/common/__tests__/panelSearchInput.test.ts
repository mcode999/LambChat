import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("panel search inputs use an editing-safe shared input", () => {
  const panelHeader = source("../PanelHeader.tsx");
  const searchInput = source("../PanelSearchInput.tsx");

  assert.match(panelHeader, /import \{ PanelSearchInput \}/);
  assert.match(panelHeader, /<PanelSearchInput/);
  assert.match(searchInput, /isEditingRef/);
  assert.match(searchInput, /onCompositionStart/);
  assert.match(searchInput, /onCompositionEnd/);
  assert.match(searchInput, /if \(!isEditingRef\.current\)/);
});

test("direct panel-search fields opt into the same refresh-safe behavior", () => {
  for (const path of [
    "../../panels/MarketplacePanel.tsx",
    "../../panels/SettingsPanel.tsx",
    "../../panels/SkillsPanel/SkillsList.tsx",
    "../../team/RoleSquare.tsx",
  ]) {
    const file = source(path);
    assert.match(file, /PanelSearchInput/);
    assert.doesNotMatch(file, /<input[^>]*className="panel-search/);
  }
});

test("search panels keep their header mounted while a search refresh is loading", () => {
  for (const path of [
    "../../persona/PersonaPlazaPanel.tsx",
    "../../panels/MarketplacePanel.tsx",
    "../../panels/SkillsPanel/SkillsList.tsx",
    "../../panels/MCPPanel.tsx",
    "../../panels/RolesPanel.tsx",
    "../../panels/UsersPanel.tsx",
  ]) {
    const file = source(path);
    assert.doesNotMatch(file, /if \(isLoading\)\s*\{\s*return <[^>]+Skeleton/);
    assert.match(file, /isInitialLoading/);
  }
});
