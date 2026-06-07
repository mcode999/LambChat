import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const filterSource = readFileSync(
  new URL("../MemoryFilter.tsx", import.meta.url),
  "utf8",
);
const componentsCss = readFileSync(
  new URL("../../../../styles/components.css", import.meta.url),
  "utf8",
);
const skillsListSource = readFileSync(
  new URL("../../SkillsPanel/SkillsList.tsx", import.meta.url),
  "utf8",
);
const marketplaceSource = readFileSync(
  new URL("../../MarketplacePanel.tsx", import.meta.url),
  "utf8",
);

test("memory filter trigger uses shared stable panel filter sizing", () => {
  assert.match(filterSource, /data-filter-menu/);
  assert.doesNotMatch(filterSource, /className="panel-search[^"]*h-10/);
  assert.match(filterSource, /import \{ PanelFilterSelect \}/);
  assert.match(
    filterSource,
    /<PanelFilterSelect[\s\S]*onChange=\{typeOnChange\}/,
  );
  assert.match(
    filterSource,
    /<PanelFilterSelect[\s\S]*onChange=\{sourceOnChange\}/,
  );
  assert.match(filterSource, /panel-filter-trigger/);
  assert.match(filterSource, /panel-filter-trigger__label/);
  assert.doesNotMatch(filterSource, /<Button[\s\S]*panel-filter-trigger/);
  assert.doesNotMatch(filterSource, /import \{ Select \}/);

  assert.match(
    componentsCss,
    /\.panel-filter-select\s*\{[\s\S]*?min-width:\s*min\(10rem,\s*42vw\);[\s\S]*?max-width:\s*min\(13rem,\s*42vw\);/,
  );
  assert.match(
    componentsCss,
    /\.panel-filter-trigger\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?justify-content:\s*flex-start;/,
  );
  assert.match(
    componentsCss,
    /\.panel-filter-trigger__label\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;/,
  );
  assert.match(
    componentsCss,
    /\.ui-select-dropdown,\s*[\s\S]*?\.glass-select-dropdown\s*\{[\s\S]*?max-height:\s*14rem;[\s\S]*?overflow-y:\s*auto;/,
  );
  assert.match(
    componentsCss,
    /\.panel-header__mobile-menu-accessory \[data-filter-menu\] \.panel-filter-trigger\s*\{[\s\S]*?max-width:\s*none;/,
  );
});

test("tag filter dropdowns opt into stable mobile filter-menu behavior", () => {
  assert.match(skillsListSource, /data-filter-menu/);
  assert.match(skillsListSource, /panel-filter-trigger/);
  assert.match(skillsListSource, /panel-filter-menu/);
  assert.match(skillsListSource, /aria-haspopup="menu"/);
  assert.match(skillsListSource, /aria-expanded=\{isFilterOpen\}/);
  assert.match(
    skillsListSource,
    /aria-pressed=\{selectedTags\.includes\(tag\)\}/,
  );
  assert.match(marketplaceSource, /data-filter-menu/);
  assert.match(marketplaceSource, /panel-filter-trigger/);
  assert.match(marketplaceSource, /panel-filter-menu/);
  assert.match(marketplaceSource, /aria-haspopup="menu"/);
  assert.match(marketplaceSource, /aria-expanded=\{isFilterOpen\}/);
  assert.match(
    marketplaceSource,
    /aria-pressed=\{selectedTags\.includes\(tag\)\}/,
  );
  assert.match(
    componentsCss,
    /\.panel-header__mobile-menu \.skill-filter-dropdown\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?max-height:\s*min\(46dvh,\s*18rem\);/,
  );
});
