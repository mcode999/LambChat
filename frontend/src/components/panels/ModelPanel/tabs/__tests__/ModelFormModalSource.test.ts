import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../ModelFormModal.tsx", import.meta.url),
  "utf8",
);

test("model form persists the supports vision profile flag", () => {
  assert.match(source, /formSupportsVision/);
  assert.match(source, /model\?\.profile\?\.supports_vision/);
  assert.match(source, /supports_vision:\s*formSupportsVision/);
  assert.match(source, /max_input_tokens:\s*maxInputTokens/);
});

test("model form persists image generation profile settings", () => {
  assert.match(source, /formSupportsImageGeneration/);
  assert.match(source, /model\?\.profile\?\.image_generation/);
  assert.match(source, /supports_generation:\s*true/);
  assert.match(source, /supports_edit:\s*formSupportsImageEdit/);
  assert.match(source, /image_generation:\s*imageGenerationProfile/);
  assert.match(source, /IMAGE_GENERATION_PROFILE_TEMPLATES/);
});

test("model form persists an explicit model icon selection", () => {
  assert.match(source, /formIcon/);
  assert.match(source, /model\?\.icon/);
  assert.match(source, /icon:\s*formIcon\s*\|\|\s*undefined/);
  assert.match(source, /<ModelIconSelect/);
});
