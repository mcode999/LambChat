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
    "PickerTrigger",
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
    ".ui-picker-trigger",
  ]) {
    assertCssSelector(css, selector);
  }

  assert.match(css, /\.btn-primary\s*\{[\s\S]*?\.ui-button--primary/);
  assert.match(css, /\.glass-input\.es-input\s*\{[\s\S]*?\.ui-input/);
});

test("legacy GlassSelect delegates to the shared Select primitive", () => {
  const source = readSource("../GlassSelect.tsx");

  assert.match(source, /import \{ Select \}/);
  assert.match(source, /return \([\s\S]*<Select/);
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

  assert.match(source, /import \{ Button, IconButton, Input, Select \}/);
  assert.match(source, /<Select[\s\S]*availableTransports/);
  assert.match(source, /<Input[\s\S]*mcp\.form\.serverNamePlaceholder/);
  assert.match(source, /<IconButton[\s\S]*removeHeader/);
  assert.doesNotMatch(source, /className="btn-icon[^"]*"/);
  assert.doesNotMatch(source, /GlassSelect/);
  assert.doesNotMatch(source, /className="glass-input/);
});

test("custom admin pickers reuse shared picker trigger and input primitives", () => {
  const providerSelect = readSource(
    "../../panels/AgentPanel/shared/ProviderSelect.tsx",
  );
  const modelIconSelect = readSource(
    "../../panels/ModelPanel/tabs/ModelIconSelect.tsx",
  );
  const source = [providerSelect, modelIconSelect].join("\n");

  assert.match(source, /import \{[\s\S]*Input[\s\S]*PickerTrigger/);
  assert.match(providerSelect, /<PickerTrigger[\s\S]*selected=\{!!selected\}/);
  assert.match(modelIconSelect, /<PickerTrigger[\s\S]*selected=\{!!selected\}/);
  assert.match(source, /<Input[\s\S]*searchRef/);
  assert.doesNotMatch(source, /className="glass-input/);
  assert.doesNotMatch(source, /<input[\s\S]*searchRef/);
});

test("normal skill form uses shared primitives for generic form controls", () => {
  const source = readSource("../../skill/SkillFormNormal.tsx");

  assert.match(
    source,
    /import \{[\s\S]*Button[\s\S]*IconButton[\s\S]*Input[\s\S]*Textarea/,
  );
  assert.match(source, /<Input[\s\S]*skills\.form\.namePlaceholder/);
  assert.match(source, /<Textarea[\s\S]*skills\.form\.descriptionPlaceholder/);
  assert.match(source, /<Input[\s\S]*adminMarketplace\.tagsPlaceholder/);
  assert.match(source, /<Input[\s\S]*skills\.form\.filePathPlaceholder/);
  assert.match(source, /<IconButton[\s\S]*addFile/);
  assert.match(source, /<IconButton[\s\S]*toggleFullscreen\(true\)/);
  assert.match(source, /<Button[\s\S]*type="submit"/);
  assert.doesNotMatch(
    source,
    /<input[\s\S]*(a\.name|a\.tagsInput|updateFilePath)/,
  );
  assert.doesNotMatch(source, /<textarea[\s\S]*a\.description/);
});

test("profile password form uses shared primitives for generic controls", () => {
  const source = readSource("../../profile/tabs/ProfilePasswordTab.tsx");

  assert.match(source, /import \{[\s\S]*Button[\s\S]*IconButton[\s\S]*Input/);
  assert.match(source, /<Input[\s\S]*profile\.oldPassword/);
  assert.match(source, /<Input[\s\S]*profile\.newPassword/);
  assert.match(source, /<Input[\s\S]*profile\.confirmPassword/);
  assert.match(source, /const visibilityToggle = \([\s\S]*<IconButton/);
  assert.match(source, /trailingSlot=\{visibilityToggle\}/);
  assert.match(source, /<Button[\s\S]*handlePasswordChange/);
  assert.doesNotMatch(source, /<input[\s\S]*Password/);
  assert.doesNotMatch(source, /LoadingSpinner/);
});

test("profile info editor uses shared primitives for generic controls", () => {
  const source = readSource("../../profile/tabs/ProfileInfoTab.tsx");

  assert.match(source, /import \{[\s\S]*Button[\s\S]*IconButton[\s\S]*Input/);
  assert.match(source, /<Input[\s\S]*profile\.usernamePlaceholder/);
  assert.match(source, /<Button[\s\S]*handleAvatarDelete/);
  assert.match(source, /<Button[\s\S]*handleUsernameUpdate/);
  assert.match(source, /<IconButton[\s\S]*setIsEditingUsername\(true\)/);
  assert.doesNotMatch(source, /<input[\s\S]*value=\{newUsername\}/);
  assert.doesNotMatch(source, /<button[\s\S]*handleUsernameUpdate/);
  assert.doesNotMatch(source, /<button[\s\S]*handleAvatarDelete/);
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
    /import \{[\s\S]*Button[\s\S]*Checkbox[\s\S]*IconButton[\s\S]*PanelFooterActions[\s\S]*Textarea[\s\S]*\}/,
  );
  assert.match(source, /PanelFooterActions/);
  assert.match(source, /<Button[\s\S]*handleImportClick/);
  assert.match(source, /<Button[\s\S]*handleCreate/);
  assert.match(source, /<IconButton[\s\S]*clearError/);
  assert.match(source, /<Checkbox[\s\S]*createAsSystem/);
  assert.match(source, /<Checkbox[\s\S]*changeToSystem/);
  assert.match(source, /<Checkbox[\s\S]*importOverwrite/);
  assert.match(source, /<Textarea[\s\S]*importJson/);
  assert.doesNotMatch(source, /className="btn-(primary|secondary|icon)[^"]*"/);
  assert.doesNotMatch(source, /className="glass-input es-textarea/);
  assert.doesNotMatch(source, /<input[\s\S]*type="checkbox"/);
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

test("notification admin modal fields use shared field primitives", () => {
  const source = readSource("../../panels/NotificationPanel.tsx");

  assert.match(source, /import \{[\s\S]*Input[\s\S]*Textarea/);
  assert.match(source, /<Input[\s\S]*notification\.titleLabel/);
  assert.match(source, /<Textarea[\s\S]*notification\.contentLabel/);
  assert.match(source, /<Input[\s\S]*notification\.startTime/);
  assert.match(source, /<Input[\s\S]*notification\.endTime/);
  assert.doesNotMatch(source, /<input[\s\S]*titleI18n/);
  assert.doesNotMatch(source, /<textarea[\s\S]*contentI18n/);
});

test("roles admin form uses shared field primitives for generic fields", () => {
  const source = readSource("../../panels/RolesPanel.tsx");

  assert.match(
    source,
    /import \{[\s\S]*Button[\s\S]*Input[\s\S]*PanelFooterActions[\s\S]*Textarea[\s\S]*\}/,
  );
  assert.match(source, /<Input[\s\S]*roles\.roleNamePlaceholder/);
  assert.match(source, /<Textarea[\s\S]*roles\.descriptionPlaceholder/);
  assert.doesNotMatch(source, /className="glass-input/);
});

test("model admin modal footers use shared panel actions", () => {
  const source = [
    readSource("../../panels/ModelPanel/tabs/ModelFormModal.tsx"),
    readSource("../../panels/ModelPanel/tabs/BatchCreateModal.tsx"),
  ].join("\n");

  assert.match(source, /PanelFooterActions/);
  assert.match(source, /<Button[\s>]/);
  assert.doesNotMatch(source, /className="btn-(primary|secondary)[^"]*"/);
});

test("model admin modal form bodies use shared field primitives", () => {
  const modelForm = readSource(
    "../../panels/ModelPanel/tabs/ModelFormModal.tsx",
  );
  const batchCreate = readSource(
    "../../panels/ModelPanel/tabs/BatchCreateModal.tsx",
  );
  const source = [modelForm, batchCreate].join("\n");

  assert.match(source, /import \{ Checkbox \}/);
  assert.match(source, /import \{[\s\S]*Input[\s\S]*Select[\s\S]*Textarea/);
  assert.match(modelForm, /<Select[\s\S]*formFallbackModel/);
  assert.match(modelForm, /<Checkbox[\s\S]*checked=\{formSupportsVision\}/);
  assert.match(batchCreate, /<Textarea[\s\S]*importJson/);
  assert.doesNotMatch(source, /GlassSelect/);
  assert.doesNotMatch(source, /className="glass-input/);
  assert.doesNotMatch(source, /<input[\s\S]*type="checkbox"/);
});

test("agent and model admin shells use shared buttons for header commands", () => {
  const source = [
    readSource("../../panels/AgentPanel/AgentConfigPanel.tsx"),
    readSource("../../panels/ModelPanel/ModelPanel.tsx"),
  ].join("\n");

  assert.match(source, /import \{ Button \}/);
  assert.match(source, /<Button[\s\S]*handleRefresh/);
  assert.doesNotMatch(source, /className="btn-secondary[^"]*"/);
});

test("agent and model admin tab actions use shared buttons", () => {
  const sources = [
    readSource("../../panels/AgentPanel/tabs/GlobalAgentTab.tsx"),
    readSource("../../panels/AgentPanel/tabs/RolesAgentTab.tsx"),
    readSource("../../panels/ModelPanel/tabs/ModelConfigTab.tsx"),
    readSource("../../panels/ModelPanel/tabs/RolesModelTab.tsx"),
  ].join("\n");

  assert.match(sources, /import \{[\s\S]*Button[\s\S]*\}/);
  assert.match(sources, /<Button[\s\S]*agentConfig\.addModel/);
  assert.match(sources, /<Button[\s\S]*common\.save/);
  assert.doesNotMatch(sources, /className="btn-(primary|secondary)[^"]*"/);
});

test("global agent editor fields use shared field primitives", () => {
  const source = readSource("../../panels/AgentPanel/tabs/GlobalAgentTab.tsx");

  assert.match(source, /import \{[\s\S]*Input[\s\S]*Textarea[\s\S]*\}/);
  assert.match(source, /<Input[\s\S]*sort_order/);
  assert.match(source, /<Input[\s\S]*agentConfig\.displayName/);
  assert.match(source, /<Textarea[\s\S]*agentConfig\.displayDescription/);
  assert.doesNotMatch(source, /className="glass-input/);
});

test("roles agent assignments use the shared checkbox primitive", () => {
  const source = readSource("../../panels/AgentPanel/tabs/RolesAgentTab.tsx");

  assert.match(source, /import \{ Checkbox \}/);
  assert.match(source, /<Checkbox[\s\S]*checked=\{isSelected\}/);
  assert.doesNotMatch(source, /<input[\s\S]*type="checkbox"/);
});

test("channel panel generic controls use shared primitives", () => {
  const source = readSource("../../panels/ChannelPanel.tsx");

  assert.match(source, /import \{[\s\S]*Button[\s\S]*Input[\s\S]*Select/);
  assert.match(source, /<Select[\s\S]*field\.options/);
  assert.match(source, /<Input[\s\S]*channel\.instanceNamePlaceholder/);
  assert.match(source, /<Button[\s\S]*handleSave/);
  assert.match(source, /<Button[\s\S]*handleDeleteClick/);
  assert.doesNotMatch(source, /GlassSelect/);
  assert.doesNotMatch(source, /className="[^"]*glass-input/);
  assert.doesNotMatch(source, /className="btn-(primary|secondary|danger)/);
});

test("settings panel generic controls use shared primitives", () => {
  const source = readSource("../../panels/SettingsPanel.tsx");

  assert.match(
    source,
    /import \{[\s\S]*Button[\s\S]*Input[\s\S]*Select[\s\S]*Textarea/,
  );
  assert.match(source, /<Select[\s\S]*CATEGORY_ORDER/);
  assert.match(source, /<Select[\s\S]*DEFAULT_AGENT/);
  assert.match(source, /setting\.type === "text"[\s\S]*<Textarea/);
  assert.match(source, /<Input[\s\S]*setting\.type === "number"/);
  assert.match(source, /<Button[\s\S]*handleExport/);
  assert.match(source, /<Button[\s\S]*handleSave\(setting\)/);
  assert.doesNotMatch(source, /GlassSelect/);
  assert.doesNotMatch(source, /className="btn-(primary|secondary|danger)/);
});

test("json schema editor uses shared primitives for generated controls", () => {
  const source = readSource("../../panels/JsonSchemaEditor.tsx");

  assert.match(source, /import \{ Button, IconButton, Input, Select \}/);
  assert.match(source, /<Select[\s\S]*field\.options/);
  assert.match(source, /<Input[\s\S]*field\.placeholder/);
  assert.match(source, /<IconButton[\s\S]*removeItem/);
  assert.match(source, /<Button[\s\S]*JSON_SCHEMA_ADD_ITEM/);
  assert.doesNotMatch(source, /GlassSelect/);
  assert.doesNotMatch(source, /<input[\s\S]*field\.placeholder/);
});

test("approval panel generated form fields use shared field primitives", () => {
  const source = readSource("../../panels/ApprovalPanel.tsx");

  assert.match(source, /import \{[\s\S]*Input[\s\S]*Select[\s\S]*Textarea/);
  assert.match(source, /case "text":[\s\S]*<Input/);
  assert.match(source, /case "number":[\s\S]*<Input/);
  assert.match(source, /case "textarea":[\s\S]*<Textarea/);
  assert.match(source, /case "select":[\s\S]*<Select/);
  assert.doesNotMatch(source, /GlassSelect/);
  assert.doesNotMatch(source, /<input[\s\S]*approval-input/);
  assert.doesNotMatch(source, /<textarea[\s\S]*approval-input/);
});

test("scheduled task form uses shared primitives for generic form controls", () => {
  const source = readSource(
    "../../panels/ScheduledTaskPanel/TaskFormModal.tsx",
  );

  assert.match(
    source,
    /import \{[\s\S]*Button[\s\S]*Input[\s\S]*PanelFooterActions[\s\S]*Select[\s\S]*Textarea/,
  );
  assert.match(source, /<PanelFooterActions/);
  assert.match(source, /<Button[\s\S]*handleSave/);
  assert.match(source, /<Input[\s\S]*scheduledTask\.namePlaceholder/);
  assert.match(source, /<Textarea[\s\S]*scheduledTask\.descriptionPlaceholder/);
  assert.match(source, /<Select[\s\S]*scheduledTask\.agentPlaceholder/);
  assert.match(source, /<Select[\s\S]*scheduledTask\.modelPlaceholder/);
  assert.doesNotMatch(source, /GlassSelect/);
  assert.doesNotMatch(source, /className="btn-(primary|secondary)[^"]*"/);
  assert.doesNotMatch(source, /<input[\s\S]*scheduled-task-input/);
  assert.doesNotMatch(source, /<textarea[\s\S]*scheduled-task-input/);
});
