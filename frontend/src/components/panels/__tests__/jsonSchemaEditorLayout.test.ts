import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const editorSource = readFileSync(
  join(import.meta.dirname, "../JsonSchemaEditor.tsx"),
  "utf8",
);

const settingsTypesSource = readFileSync(
  join(import.meta.dirname, "../../../types/settings.ts"),
  "utf8",
);

const settingDefinitionsSource = readFileSync(
  join(import.meta.dirname, "../../../../../src/kernel/config/definitions.py"),
  "utf8",
);

test("json schema fields can declare their layout width", () => {
  assert.match(settingsTypesSource, /layout_width\?:\s*"compact" \| "full"/);
  assert.match(editorSource, /getFieldLayoutClass\(field\)/);
  assert.match(editorSource, /json-schema-field--compact/);
});

test("welcome suggestion editor gives icon less space than text", () => {
  assert.match(
    settingDefinitionsSource,
    /name="icon"[\s\S]*layout_width="compact"/,
  );
  assert.match(
    settingDefinitionsSource,
    /name="text"[\s\S]*layout_width="full"/,
  );
});
