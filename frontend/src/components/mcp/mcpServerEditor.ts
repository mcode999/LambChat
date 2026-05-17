export interface MCPServerEditorModeInput {
  isCreating: boolean;
  createAsSystem: boolean;
  changeToSystem: boolean;
}

export function resolveMCPServerFormSystemMode({
  isCreating,
  createAsSystem,
  changeToSystem,
}: MCPServerEditorModeInput): boolean {
  if (isCreating) return createAsSystem;
  return changeToSystem;
}
