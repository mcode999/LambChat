import test from "node:test";
import assert from "node:assert/strict";

import { resolveMCPServerFormSystemMode } from "../mcpServerEditor.ts";

test("uses the pending server type when editing an MCP server", () => {
  assert.equal(
    resolveMCPServerFormSystemMode({
      isCreating: false,
      createAsSystem: false,
      changeToSystem: true,
    }),
    true,
  );

  assert.equal(
    resolveMCPServerFormSystemMode({
      isCreating: false,
      createAsSystem: false,
      changeToSystem: false,
    }),
    false,
  );
});

test("uses create-as-system only while creating an MCP server", () => {
  assert.equal(
    resolveMCPServerFormSystemMode({
      isCreating: true,
      createAsSystem: true,
      changeToSystem: false,
    }),
    true,
  );
});
