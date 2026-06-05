import {
  AlertCircle,
  CheckCircle2,
  FileJson2,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  IMAGE_GENERATION_CAPABILITY_TEMPLATES,
  getImageGenerationProviderHintKey,
  getImageGenerationProviderLabelKey,
  parseImageCapabilitiesStatus,
  type ImageCapabilitiesStatus,
} from "./imageGenerationSettingsHelperUtils";

interface ImageGenerationProviderHintProps {
  provider: string;
}

export function ImageGenerationProviderHint({
  provider,
}: ImageGenerationProviderHintProps) {
  const { t } = useTranslation();
  const label = t(getImageGenerationProviderLabelKey(provider), provider);
  const hint = t(getImageGenerationProviderHintKey(provider), {
    defaultValue: t("settings.imageGeneration.providerHint.custom", {
      provider,
    }),
    provider,
  });

  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
      <FileJson2
        size={14}
        className="mt-0.5 flex-shrink-0 text-stone-400 dark:text-stone-500"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="font-medium text-stone-700 dark:text-stone-200">
          {label}
        </div>
        <div className="mt-0.5 leading-relaxed">{hint}</div>
      </div>
    </div>
  );
}

interface ImageGenerationCapabilitiesHelperProps {
  provider: string;
  value: string;
  disabled: boolean;
  onApplyTemplate: (template: Record<string, unknown>) => void;
}

export function ImageGenerationCapabilitiesHelper({
  provider,
  value,
  disabled,
  onApplyTemplate,
}: ImageGenerationCapabilitiesHelperProps) {
  const { t } = useTranslation();
  const status = useMemo(() => parseImageCapabilitiesStatus(value), [value]);
  const statusMeta = getStatusMeta(status);

  const templateButtons = [
    {
      key: "defaults" as const,
      label: t("settings.imageGeneration.applyDefaults"),
      template: IMAGE_GENERATION_CAPABILITY_TEMPLATES.defaults,
    },
    {
      key: "generic_openai_images" as const,
      label: t("settings.imageGeneration.applyGeneric"),
      template: IMAGE_GENERATION_CAPABILITY_TEMPLATES.generic_openai_images,
    },
    {
      key: "siliconflow" as const,
      label: t("settings.imageGeneration.applySiliconFlow"),
      template: IMAGE_GENERATION_CAPABILITY_TEMPLATES.siliconflow,
    },
  ];

  return (
    <div className="mt-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-stone-700 dark:text-stone-200">
              {t("settings.imageGeneration.capabilitiesTitle")}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${statusMeta.className}`}
            >
              <statusMeta.Icon size={12} aria-hidden="true" />
              {t(statusMeta.labelKey)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            {t("settings.imageGeneration.capabilitiesDescription", {
              provider,
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {templateButtons.map((button) => (
            <button
              key={button.key}
              type="button"
              disabled={disabled}
              onClick={() => onApplyTemplate(button.template)}
              className="btn-secondary inline-flex items-center gap-1 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {button.key === "defaults" ? (
                <RotateCcw size={12} aria-hidden="true" />
              ) : (
                <FileJson2 size={12} aria-hidden="true" />
              )}
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function getStatusMeta(status: ImageCapabilitiesStatus): {
  Icon: LucideIcon;
  className: string;
  labelKey: string;
} {
  if (status === "valid") {
    return {
      Icon: CheckCircle2,
      className:
        "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
      labelKey: "settings.imageGeneration.jsonValid",
    };
  }
  if (status === "invalid") {
    return {
      Icon: AlertCircle,
      className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
      labelKey: "settings.imageGeneration.jsonInvalid",
    };
  }
  return {
    Icon: FileJson2,
    className:
      "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
    labelKey: "settings.imageGeneration.usingDefaults",
  };
}
