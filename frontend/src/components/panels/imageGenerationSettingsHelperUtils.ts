export type ImageGenerationProvider =
  | "openai_images"
  | "generic_openai_images"
  | "siliconflow";

type ImageCapabilitiesTemplateKey =
  | "defaults"
  | "generic_openai_images"
  | "siliconflow";

export type ImageCapabilitiesStatus = "empty" | "valid" | "invalid";

export const IMAGE_GENERATION_PROVIDER_LABEL_KEYS: Record<string, string> = {
  openai_images: "settings.imageGeneration.provider.openai_images",
  generic_openai_images:
    "settings.imageGeneration.provider.generic_openai_images",
  siliconflow: "settings.imageGeneration.provider.siliconflow",
};

export const IMAGE_GENERATION_PROVIDER_HINT_KEYS: Record<string, string> = {
  openai_images: "settings.imageGeneration.providerHint.openai_images",
  generic_openai_images:
    "settings.imageGeneration.providerHint.generic_openai_images",
  siliconflow: "settings.imageGeneration.providerHint.siliconflow",
};

export const IMAGE_GENERATION_CAPABILITY_TEMPLATES = {
  defaults: {},
  generic_openai_images: {
    providers: {
      generic_openai_images: {
        generation_endpoint: "/images/generations",
        edit_endpoint: "/images/edits",
        supports_edit: true,
        supported_parameters: ["model", "prompt", "size", "n"],
        max_n: 10,
      },
    },
  },
  siliconflow: {
    providers: {
      siliconflow: {
        generation_endpoint: "/images/generations",
        edit_endpoint: null,
        supports_edit: false,
        supported_generation_parameters: [
          "model",
          "prompt",
          "size",
          "n",
          "negative_prompt",
          "seed",
          "steps",
          "guidance_scale",
        ],
        parameter_map: {
          size: "image_size",
          n: "batch_size",
          steps: "num_inference_steps",
        },
        max_n: 4,
      },
    },
  },
} as const satisfies Record<
  ImageCapabilitiesTemplateKey,
  Record<string, unknown>
>;

export function getImageGenerationProviderLabelKey(provider: string): string {
  return (
    IMAGE_GENERATION_PROVIDER_LABEL_KEYS[provider] ||
    "settings.imageGeneration.provider.custom"
  );
}

export function getImageGenerationProviderHintKey(provider: string): string {
  return (
    IMAGE_GENERATION_PROVIDER_HINT_KEYS[provider] ||
    "settings.imageGeneration.providerHint.custom"
  );
}

export function parseImageCapabilitiesStatus(
  value: string,
): ImageCapabilitiesStatus {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "{}") {
    return "empty";
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "invalid";
    }
    return Object.keys(parsed).length === 0 ? "empty" : "valid";
  } catch {
    return "invalid";
  }
}
