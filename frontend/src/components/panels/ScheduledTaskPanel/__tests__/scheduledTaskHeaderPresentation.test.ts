import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const panelSource = source("../index.tsx");
const statusFilterSource = source("../StatusFilter.tsx");
const panelControlsSource = source("../../../common/PanelControls.tsx");

test("scheduled task header uses shared panel action styling", () => {
  assert.match(statusFilterSource, /PanelFilterSelect/);
  assert.match(statusFilterSource, /data-filter-menu/);
  assert.match(statusFilterSource, /scheduledTask\.allStatuses/);
  assert.match(panelControlsSource, /panel-filter-trigger/);
  assert.match(panelControlsSource, /panel-filter-menu/);
  assert.match(panelSource, /scheduledTask\.create/);
  assert.doesNotMatch(
    panelSource,
    /<select[\s\S]*?className="scheduled-task-input min-h-10 px-3 py-0"/,
  );
  assert.doesNotMatch(
    panelSource,
    /className="scheduled-task-button scheduled-task-button--primary"/,
  );
});
