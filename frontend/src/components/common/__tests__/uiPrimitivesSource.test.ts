import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function assertExports(source: string, name: string): void {
  assert.match(
    source,
    new RegExp(`export \\{[\\s\\S]*\\b${name}\\b[\\s\\S]*\\} from`),
  );
}

function assertCssSelector(source: string, selector: string): void {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(source, new RegExp(`${escaped}[\\s\\S]*?\\{`));
}

test("common ui primitives are exposed from a single reusable entrypoint", () => {
  const commonIndex = readSource("../index.ts");
  const uiIndex = readSource("../ui/index.ts");

  for (const name of [
    "Button",
    "IconButton",
    "Input",
    "Textarea",
    "Select",
    "FormField",
  ]) {
    assertExports(uiIndex, name);
    assertExports(commonIndex, name);
  }

  assert.match(uiIndex, /export type \{ ButtonVariant, ButtonSize \}/);
  assert.match(uiIndex, /export type \{ SelectOption \}/);
});

test("common panel controls are exposed for consistent admin panel composition", () => {
  const commonIndex = readSource("../index.ts");
  const panelControls = readSource("../PanelControls.tsx");

  for (const name of ["PanelFilterSelect", "PanelFooterActions"]) {
    assertExports(commonIndex, name);
  }

  assert.match(panelControls, /import \{ Select \}/);
  assert.match(panelControls, /panel-filter-select/);
  assert.match(panelControls, /panel-footer-actions/);
});

test("ui primitive styles share one visual system in components css", () => {
  const css = readSource("../../../styles/components.css");

  for (const selector of [
    ".ui-button",
    ".ui-button--primary",
    ".ui-button--secondary",
    ".ui-button--ghost",
    ".ui-button--danger",
    ".ui-icon-button",
    ".ui-field",
    ".ui-input",
    ".ui-textarea",
    ".ui-select-trigger",
    ".ui-select-dropdown",
    ".ui-select-option",
  ]) {
    assertCssSelector(css, selector);
  }

  assert.match(css, /\.btn-primary\s*\{[\s\S]*?\.ui-button--primary/);
  assert.match(css, /\.glass-input\.es-input\s*\{[\s\S]*?\.ui-input/);
});

test("legacy GlassSelect delegates to the shared Select primitive", () => {
  const source = readSource("../GlassSelect.tsx");

  assert.match(source, /import \{ Select \}/);
  assert.match(source, /return <Select/);
  assert.match(
    source,
    /placeholder=\{placeholder \?\? options\[0\]\?\.label \?\? ""\}/,
  );
});

test("first migrated admin forms consume shared primitives instead of generic legacy classes", () => {
  const migratedSources = [
    readSource("../../panels/SkillsPanel/GithubImportModal.tsx"),
    readSource("../../panels/SkillsPanel/ZipUploadModal.tsx"),
    readSource("../../panels/SkillsPanel/PublishDialog.tsx"),
    readSource("../../mcp/MCPServerForm.tsx"),
  ].join("\n");

  assert.match(migratedSources, /import \{ Button/);
  assert.match(
    migratedSources,
    /import \{ Button, FormField, Input, Textarea \}/,
  );
  assert.match(migratedSources, /<Button[\s>]/);
  assert.match(migratedSources, /<Input[\s>]/);
  assert.match(migratedSources, /<Textarea[\s>]/);
  assert.match(migratedSources, /<FormField[\s>]/);
  assert.doesNotMatch(
    migratedSources,
    /className="btn-(primary|secondary)[^"]*"/,
  );
  assert.doesNotMatch(migratedSources, /className="input-field[^"]*"/);
});

test("mcp server form uses shared icon buttons for generic icon actions", () => {
  const source = readSource("../../mcp/MCPServerForm.tsx");

  assert.match(source, /import \{ Button, IconButton \}/);
  assert.match(source, /<IconButton[\s\S]*removeHeader/);
  assert.doesNotMatch(source, /className="btn-icon[^"]*"/);
});

test("skills list actions use shared buttons for generic commands", () => {
  const source = [
    readSource("../../panels/SkillsPanel/SkillsList.tsx"),
    readSource("../../panels/SkillsPanel/BatchActionBar.tsx"),
  ].join("\n");

  assert.match(source, /import \{ Button, IconButton \}/);
  assert.match(source, /<Button[\s>]/);
  assert.match(source, /<IconButton[\s>]/);
  assert.doesNotMatch(source, /className="btn-(primary|secondary|icon)[^"]*"/);
});

test("marketplace panel generic actions use shared buttons", () => {
  const source = readSource("../../panels/MarketplacePanel.tsx");

  assert.match(source, /import \{ Button, IconButton \}/);
  assert.match(source, /<Button[\s>]/);
  assert.match(source, /<IconButton[\s>]/);
  assert.doesNotMatch(source, /className="btn-(primary|secondary|icon)[^"]*"/);
});

test("small reusable panel controls use shared panel primitives where generic", () => {
  const memoryFilter = readSource("../../panels/MemoryPanel/MemoryFilter.tsx");
  const mcpServerCard = readSource("../../mcp/MCPServerCard.tsx");

  assert.match(memoryFilter, /import \{ PanelFilterSelect \}/);
  assert.match(memoryFilter, /<PanelFilterSelect[\s\S]*typeOnChange/);
  assert.match(memoryFilter, /<PanelFilterSelect[\s\S]*sourceOnChange/);
  assert.doesNotMatch(memoryFilter, /import \{ Button \}/);
  assert.doesNotMatch(memoryFilter, /import \{ Select \}/);
  assert.doesNotMatch(memoryFilter, /<Button[\s\S]*panel-filter-trigger/);
  assert.doesNotMatch(memoryFilter, /className="btn-secondary[^"]*"/);

  assert.match(mcpServerCard, /import \{ IconButton \}/);
  assert.match(mcpServerCard, /<IconButton[\s\S]*onEdit\(server\)/);
  assert.match(mcpServerCard, /<IconButton[\s\S]*onDelete\(server\.name/);
  assert.doesNotMatch(mcpServerCard, /className="btn-icon[^"]*"/);
});

test("memory panel generic actions and editor fields use shared primitives", () => {
  const memoryPanel = readSource("../../panels/MemoryPanel/index.tsx");
  const memoryEditor = readSource("../../panels/MemoryPanel/MemoryEditor.tsx");
  const detailModal = readSource("../../panels/MemoryPanel/DetailModal.tsx");

  assert.match(memoryPanel, /import \{ Button, IconButton \}/);
  assert.match(memoryPanel, /<Button[\s\S]*setEditingMemory\(null\)/);
  assert.match(memoryPanel, /<IconButton[\s\S]*setEditingMemory\(memory\)/);
  assert.match(
    memoryPanel,
    /<IconButton[\s\S]*setDeleteId\(memory\.memory_id\)/,
  );
  assert.doesNotMatch(
    memoryPanel,
    /className="btn-(primary|secondary|icon)[^"]*"/,
  );

  assert.match(memoryEditor, /PanelFooterActions/);
  assert.match(
    memoryEditor,
    /import \{[\s\S]*Button[\s\S]*FormField[\s\S]*Input[\s\S]*PanelFooterActions[\s\S]*Textarea[\s\S]*\}/,
  );
  assert.match(memoryEditor, /<FormField[\s\S]*memory\.titleLabel/);
  assert.match(memoryEditor, /<Input[\s\S]*memory\.titlePlaceholder/);
  assert.match(memoryEditor, /<Textarea[\s\S]*memory\.contentPlaceholder/);
  assert.doesNotMatch(memoryEditor, /className="btn-(primary|secondary)[^"]*"/);
  assert.doesNotMatch(memoryEditor, /className="glass-input/);

  assert.match(detailModal, /import \{ Button, PanelFooterActions \}/);
  assert.match(detailModal, /PanelFooterActions/);
  assert.match(detailModal, /<Button[\s\S]*variant="danger"/);
  assert.doesNotMatch(detailModal, /className="btn-(danger|secondary)[^"]*"/);
});

test("mcp panel generic shell actions use shared buttons", () => {
  const source = readSource("../../panels/MCPPanel.tsx");

  assert.match(
    source,
    /import \{ Button, IconButton, PanelFooterActions, Textarea \}/,
  );
  assert.match(source, /PanelFooterActions/);
  assert.match(source, /<Button[\s\S]*handleImportClick/);
  assert.match(source, /<Button[\s\S]*handleCreate/);
  assert.match(source, /<IconButton[\s\S]*clearError/);
  assert.match(source, /<Textarea[\s\S]*importJson/);
  assert.doesNotMatch(source, /className="btn-(primary|secondary|icon)[^"]*"/);
  assert.doesNotMatch(source, /className="glass-input es-textarea/);
});

test("core admin crud panels use shared panel controls for generic actions", () => {
  const sources = [
    readSource("../../panels/NotificationPanel.tsx"),
    readSource("../../panels/FeedbackPanel.tsx"),
    readSource("../../panels/UsersPanel.tsx"),
    readSource("../../panels/RolesPanel.tsx"),
  ].join("\n");

  assert.match(sources, /PanelFilterSelect/);
  assert.match(sources, /PanelFooterActions/);
  assert.match(sources, /<Button[\s>]/);
  assert.doesNotMatch(
    sources,
    /className="btn-(primary|secondary|danger|icon)[^"]*"/,
  );
  assert.doesNotMatch(sources, /<GlassSelect/);
});
