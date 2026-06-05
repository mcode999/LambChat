import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  IMAGE_GENERATION_CAPABILITY_TEMPLATES,
  getImageGenerationProviderHintKey,
  getImageGenerationProviderLabelKey,
  parseImageCapabilitiesStatus,
} from "../imageGenerationSettingsHelperUtils.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getProviderTemplate(
  template: Readonly<Record<string, unknown>>,
  providerName: string,
) {
  const providers = template.providers;
  assert.ok(isRecord(providers));
  const provider = providers[providerName];
  assert.ok(isRecord(provider));
  return provider;
}

test("image generation capability templates match supported backend override keys", () => {
  assert.deepEqual(IMAGE_GENERATION_CAPABILITY_TEMPLATES.defaults, {});

  const generic = getProviderTemplate(
    IMAGE_GENERATION_CAPABILITY_TEMPLATES.generic_openai_images,
    "generic_openai_images",
  );
  assert.equal(generic.generation_endpoint, "/images/generations");
  assert.equal(generic.edit_endpoint, "/images/edits");
  assert.deepEqual(generic.supported_parameters, [
    "model",
    "prompt",
    "size",
    "n",
  ]);
  assert.equal(generic.max_n, 10);

  const siliconflow = getProviderTemplate(
    IMAGE_GENERATION_CAPABILITY_TEMPLATES.siliconflow,
    "siliconflow",
  );
  assert.equal(siliconflow.generation_endpoint, "/images/generations");
  assert.equal(siliconflow.edit_endpoint, null);
  assert.equal(siliconflow.supports_edit, false);
  assert.equal(siliconflow.max_n, 4);
  assert.deepEqual(siliconflow.parameter_map, {
    size: "image_size",
    n: "batch_size",
    steps: "num_inference_steps",
  });
  assert.deepEqual(siliconflow.supported_generation_parameters, [
    "model",
    "prompt",
    "size",
    "n",
    "negative_prompt",
    "seed",
    "steps",
    "guidance_scale",
  ]);
});

test("image generation capabilities status accepts only JSON objects", () => {
  assert.equal(parseImageCapabilitiesStatus(""), "empty");
  assert.equal(parseImageCapabilitiesStatus("   {} "), "empty");
  assert.equal(
    parseImageCapabilitiesStatus('{"providers":{"siliconflow":{}}}'),
    "valid",
  );
  assert.equal(parseImageCapabilitiesStatus("[]"), "invalid");
  assert.equal(parseImageCapabilitiesStatus("null"), "invalid");
  assert.equal(parseImageCapabilitiesStatus("{"), "invalid");
});

test("image generation provider label and hint keys fall back for custom profiles", () => {
  assert.equal(
    getImageGenerationProviderLabelKey("siliconflow"),
    "settings.imageGeneration.provider.siliconflow",
  );
  assert.equal(
    getImageGenerationProviderHintKey("siliconflow"),
    "settings.imageGeneration.providerHint.siliconflow",
  );
  assert.equal(
    getImageGenerationProviderLabelKey("custom_provider"),
    "settings.imageGeneration.provider.custom",
  );
  assert.equal(
    getImageGenerationProviderHintKey("custom_provider"),
    "settings.imageGeneration.providerHint.custom",
  );
});

test("image generation settings helper copy exists in every locale", () => {
  const locales = ["en", "zh", "ja", "ko", "ru"];
  for (const locale of locales) {
    const localePath = join(
      import.meta.dirname,
      "../../../i18n/locales",
      `${locale}.json`,
    );
    const data = JSON.parse(readFileSync(localePath, "utf8")) as unknown;
    assert.ok(isRecord(data));

    const subcategories: unknown = data.subcategories;
    assert.ok(isRecord(subcategories));
    assert.equal(typeof subcategories.image_generation, "string");

    const settings: unknown = data.settings;
    assert.ok(isRecord(settings));
    const imageGeneration: unknown = settings.imageGeneration;
    assert.ok(isRecord(imageGeneration));

    for (const key of [
      "applyDefaults",
      "applyGeneric",
      "applySiliconFlow",
      "capabilitiesDescription",
      "capabilitiesTitle",
      "jsonInvalid",
      "jsonValid",
      "usingDefaults",
    ]) {
      assert.equal(typeof imageGeneration[key], "string");
    }

    for (const nestedKey of ["provider", "providerHint"]) {
      const nested: unknown = imageGeneration[nestedKey];
      assert.ok(isRecord(nested));
      for (const provider of [
        "custom",
        "generic_openai_images",
        "openai_images",
        "siliconflow",
      ]) {
        assert.equal(typeof nested[provider], "string");
      }
    }
  }
});
