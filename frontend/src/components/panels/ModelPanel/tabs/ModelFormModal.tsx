import { useState, useCallback } from "react";
import { Eye, EyeOff, FileJson2, Save, Plus, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Checkbox } from "../../../common/Checkbox";
import { EditorSidebar } from "../../../common/EditorSidebar";
import {
  Button,
  IconButton,
  Input,
  PanelFooterActions,
  Select,
  Textarea,
} from "../../../common";
import { ProviderSelect } from "../../AgentPanel/shared";
import { modelApi } from "../../../../services/api/model";
import type {
  ImageGenerationProfile,
  ModelConfig,
  ModelConfigCreate,
  ModelConfigUpdate,
  ModelProfile,
  ProviderType,
} from "../../../../services/api/model";
import { ImageGenerationProviderHint } from "../../ImageGenerationSettingsHelper";
import { IMAGE_GENERATION_PROFILE_TEMPLATES } from "../../imageGenerationSettingsHelperUtils";
import { ModelIconSelect } from "./ModelIconSelect";

interface ModelFormModalProps {
  model: ModelConfig | null; // null = creating, non-null = editing
  models: ModelConfig[];
  onClose: () => void;
  onSaved: () => void;
}

const IMAGE_PROVIDER_OPTIONS = [
  {
    value: "openai_images",
    labelKey: "settings.imageGeneration.provider.openai_images",
  },
  {
    value: "generic_openai_images",
    labelKey: "settings.imageGeneration.provider.generic_openai_images",
  },
  {
    value: "siliconflow",
    labelKey: "settings.imageGeneration.provider.siliconflow",
  },
  { value: "custom", labelKey: "settings.imageGeneration.provider.custom" },
];

type ImageProfileTemplate =
  (typeof IMAGE_GENERATION_PROFILE_TEMPLATES)[keyof typeof IMAGE_GENERATION_PROFILE_TEMPLATES];

function formatStringList(value?: readonly string[]): string {
  return value?.join("\n") ?? "";
}

function parseStringList(value: string): string[] | undefined {
  const items = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function formatParameterMap(value?: Readonly<Record<string, string>>): string {
  if (!value || Object.keys(value).length === 0) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function parseParameterMap(value: string): Record<string, string> | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid");
  }
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(parsed)) {
    if (typeof rawValue !== "string") {
      throw new Error("invalid");
    }
    const normalizedKey = key.trim();
    const normalizedValue = rawValue.trim();
    if (normalizedKey && normalizedValue) {
      result[normalizedKey] = normalizedValue;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function asNumber(value: string): number | undefined {
  return value.trim() ? parseInt(value, 10) : undefined;
}

export const ModelFormModal = ({
  model,
  models,
  onClose,
  onSaved,
}: ModelFormModalProps) => {
  const { t } = useTranslation();
  const isEditing = model !== null;

  const [formValue, setFormValue] = useState(model?.value || "");
  const [formLabel, setFormLabel] = useState(model?.label || "");
  const [formDescription, setFormDescription] = useState(
    model?.description || "",
  );
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiBase, setFormApiBase] = useState(model?.api_base || "");
  const [formTemperature, setFormTemperature] = useState(
    model?.temperature?.toString() || "",
  );
  const [formMaxTokens, setFormMaxTokens] = useState(
    model?.max_tokens?.toString() || "",
  );
  const [formMaxInputTokens, setFormMaxInputTokens] = useState(
    model?.profile?.max_input_tokens?.toString() || "",
  );
  const [formSupportsVision, setFormSupportsVision] = useState(
    Boolean(model?.profile?.supports_vision),
  );
  const existingImageProfile = model?.profile?.image_generation;
  const [formSupportsImageGeneration, setFormSupportsImageGeneration] =
    useState(Boolean(existingImageProfile?.supports_generation));
  const [formSupportsImageEdit, setFormSupportsImageEdit] = useState(
    Boolean(existingImageProfile?.supports_edit),
  );
  const [formImageProvider, setFormImageProvider] = useState(
    existingImageProfile?.provider || "openai_images",
  );
  const [formGenerationEndpoint, setFormGenerationEndpoint] = useState(
    existingImageProfile?.generation_endpoint || "",
  );
  const [formEditEndpoint, setFormEditEndpoint] = useState(
    existingImageProfile?.edit_endpoint || "",
  );
  const [formGenerationParameters, setFormGenerationParameters] = useState(
    formatStringList(existingImageProfile?.supported_generation_parameters),
  );
  const [formEditParameters, setFormEditParameters] = useState(
    formatStringList(existingImageProfile?.supported_edit_parameters),
  );
  const [formParameterMap, setFormParameterMap] = useState(
    formatParameterMap(existingImageProfile?.parameter_map),
  );
  const [formImageMaxN, setFormImageMaxN] = useState(
    existingImageProfile?.max_n?.toString() || "",
  );
  const [formMaxInputImages, setFormMaxInputImages] = useState(
    existingImageProfile?.max_input_images?.toString() || "",
  );
  const [formProvider, setFormProvider] = useState(model?.provider || "");
  const [formIcon, setFormIcon] = useState(model?.icon || "");
  const [formFallbackModel, setFormFallbackModel] = useState(
    model?.fallback_model || "",
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isMaskedApiKey = (key: string) => key.includes("...") || key === "****";

  const applyImageTemplate = useCallback(
    (template: ImageProfileTemplate) => {
      setFormSupportsImageGeneration(Boolean(template.supports_generation));
      setFormSupportsImageEdit(Boolean(template.supports_edit));
      setFormImageProvider(String(template.provider || "openai_images"));
      setFormGenerationEndpoint(String(template.generation_endpoint || ""));
      setFormEditEndpoint(String(template.edit_endpoint || ""));
      setFormGenerationParameters(
        formatStringList(template.supported_generation_parameters),
      );
      setFormEditParameters(
        formatStringList(template.supported_edit_parameters),
      );
      setFormParameterMap(formatParameterMap(template.parameter_map));
      setFormImageMaxN(template.max_n ? String(template.max_n) : "");
      setFormMaxInputImages(
        template.max_input_images ? String(template.max_input_images) : "",
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!formValue.trim() || !formLabel.trim()) {
      toast.error(t("agentConfig.valueAndLabelRequired"));
      return;
    }

    const temperature = formTemperature
      ? parseFloat(formTemperature)
      : undefined;
    const maxTokens = formMaxTokens ? parseInt(formMaxTokens, 10) : undefined;
    const maxInputTokens = formMaxInputTokens
      ? parseInt(formMaxInputTokens, 10)
      : undefined;
    const imageMaxN = asNumber(formImageMaxN);
    const maxInputImages = asNumber(formMaxInputImages);
    let parameterMap: Record<string, string> | undefined;
    try {
      parameterMap = parseParameterMap(formParameterMap);
    } catch {
      toast.error(t("agentConfig.invalidImageParameterMap"));
      return;
    }
    const imageGenerationProfile: ImageGenerationProfile | undefined =
      formSupportsImageGeneration
        ? {
            supports_generation: true,
            supports_edit: formSupportsImageEdit,
            provider: formImageProvider || undefined,
            generation_endpoint: formGenerationEndpoint.trim() || undefined,
            edit_endpoint: formEditEndpoint.trim() || undefined,
            supported_generation_parameters: parseStringList(
              formGenerationParameters,
            ),
            supported_edit_parameters: parseStringList(formEditParameters),
            parameter_map: parameterMap,
            max_n: imageMaxN,
            max_input_images: maxInputImages,
          }
        : undefined;
    const profile: ModelProfile = {
      ...(maxInputTokens ? { max_input_tokens: maxInputTokens } : {}),
      supports_vision: formSupportsVision,
      ...(imageGenerationProfile
        ? { image_generation: imageGenerationProfile }
        : {}),
    };

    if (
      formTemperature &&
      (isNaN(temperature!) || temperature! < 0 || temperature! > 2)
    ) {
      toast.error(t("agentConfig.invalidTemperature"));
      return;
    }
    if (formMaxTokens && isNaN(maxTokens!)) {
      toast.error(t("agentConfig.invalidMaxTokens"));
      return;
    }
    if (formMaxInputTokens && isNaN(maxInputTokens!)) {
      toast.error(t("agentConfig.invalidMaxInputTokens"));
      return;
    }
    if (formImageMaxN && (imageMaxN == null || isNaN(imageMaxN))) {
      toast.error(t("agentConfig.invalidImageMaxN"));
      return;
    }
    if (
      formMaxInputImages &&
      (maxInputImages == null || isNaN(maxInputImages))
    ) {
      toast.error(t("agentConfig.invalidMaxInputImages"));
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && model?.id) {
        const update: ModelConfigUpdate = {
          provider: (formProvider || undefined) as ProviderType | undefined,
          icon: formIcon || undefined,
          label: formLabel.trim(),
          description: formDescription.trim() || undefined,
          ...(formApiKey.trim() && !isMaskedApiKey(formApiKey.trim())
            ? { api_key: formApiKey.trim() }
            : {}),
          api_base: formApiBase.trim() || undefined,
          temperature,
          max_tokens: maxTokens,
          profile,
          fallback_model: formFallbackModel.trim() || undefined,
        };
        await modelApi.update(model.id, update);
        toast.success(t("agentConfig.modelSaveSuccess"));
      } else {
        const data: ModelConfigCreate = {
          value: formValue.trim(),
          provider: (formProvider || undefined) as ProviderType | undefined,
          icon: formIcon || undefined,
          label: formLabel.trim(),
          description: formDescription.trim() || undefined,
          api_key: formApiKey.trim() || undefined,
          api_base: formApiBase.trim() || undefined,
          temperature,
          max_tokens: maxTokens,
          profile,
          fallback_model: formFallbackModel.trim() || undefined,
          enabled: true,
        };
        await modelApi.create(data);
        toast.success(t("agentConfig.modelCreateSuccess"));
      }
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || t("agentConfig.modelSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [
    formValue,
    formLabel,
    formDescription,
    formApiKey,
    formApiBase,
    formTemperature,
    formMaxTokens,
    formMaxInputTokens,
    formSupportsVision,
    formSupportsImageGeneration,
    formSupportsImageEdit,
    formImageProvider,
    formGenerationEndpoint,
    formEditEndpoint,
    formGenerationParameters,
    formEditParameters,
    formParameterMap,
    formImageMaxN,
    formMaxInputImages,
    formProvider,
    formIcon,
    formFallbackModel,
    isEditing,
    model,
    t,
    onSaved,
  ]);

  return (
    <EditorSidebar
      open={true}
      onClose={onClose}
      title={
        isEditing ? t("agentConfig.editModel") : t("agentConfig.createModel")
      }
      subtitle={
        isEditing
          ? t("agentConfig.editModelDesc", "修改模型配置信息")
          : t("agentConfig.createModelDesc", "添加一个新的模型配置")
      }
      icon={isEditing ? <Pencil size={16} /> : <Plus size={16} />}
      footer={
        <PanelFooterActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={isSaving}
            leftIcon={<Save size={16} />}
          >
            {t("common.save")}
          </Button>
        </PanelFooterActions>
      }
    >
      <div className="es-form">
        {/* Basic Info */}
        <div className="es-field">
          <label className="es-label">
            {t("agentConfig.modelValue")} <span className="es-required">*</span>
          </label>
          <Input
            type="text"
            value={formValue}
            onChange={(e) => setFormValue(e.target.value)}
            disabled={isEditing}
            placeholder={t("agentConfig.modelValuePlaceholder")}
            className="es-input disabled:opacity-50"
          />
          <p className="es-hint">
            {isEditing
              ? t("agentConfig.modelValueReadonly", "模型 ID 创建后不可修改")
              : t(
                  "agentConfig.modelValueHint",
                  "例如 anthropic/claude-3-5-sonnet，用于路由到对应的 API",
                )}
          </p>
        </div>
        <div className="es-field">
          <label className="es-label">
            {t("agentConfig.modelLabel")} <span className="es-required">*</span>
          </label>
          <Input
            type="text"
            value={formLabel}
            onChange={(e) => setFormLabel(e.target.value)}
            placeholder={t("agentConfig.modelLabelPlaceholder")}
            className="es-input"
          />
        </div>

        {/* Advanced (collapsed) */}
        <details className="group">
          <summary className="text-xs text-theme-text-secondary cursor-pointer select-none hover:text-theme-text transition-colors py-1">
            {t("agentConfig.advancedConfig", "高级配置")}
          </summary>
          <div
            className="space-y-2 mt-2 pt-2 border-t"
            style={{ borderColor: "var(--glass-border)" }}
          >
            <div className="es-field">
              <label className="es-label">
                {t("agentConfig.modelDescription")}
              </label>
              <Input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t("agentConfig.modelDescriptionPlaceholder")}
                className="es-input"
              />
            </div>
            <div className="es-field">
              <label className="es-label">
                {t("agentConfig.modelProvider")}
              </label>
              <ProviderSelect
                value={formProvider}
                onChange={setFormProvider}
                placeholder={t("agentConfig.providerAuto")}
              />
              <p className="es-hint">{t("agentConfig.providerHint")}</p>
            </div>
            <div className="es-field">
              <label className="es-label">{t("agentConfig.modelIcon")}</label>
              <ModelIconSelect
                value={formIcon}
                onChange={setFormIcon}
                placeholder={t("agentConfig.iconAuto")}
              />
              <p className="es-hint">{t("agentConfig.iconHint")}</p>
            </div>
            <div className="es-field">
              <label className="es-label">
                {t("agentConfig.fallbackModel", "Fallback Model")}
              </label>
              <Select
                value={formFallbackModel}
                onChange={setFormFallbackModel}
                placeholder={t("agentConfig.noFallback", "None")}
                options={models
                  .filter((m) => m.id !== model?.id && m.enabled)
                  .map((m) => ({
                    value: m.id!,
                    label: `${m.label} (${m.value})`,
                  }))}
              />
              <p className="es-hint">
                {t(
                  "agentConfig.fallbackModelHint",
                  "主模型重试失败后自动切换的备用模型",
                )}
              </p>
            </div>
            <div className="es-field">
              <label className="es-label">{t("agentConfig.modelApiKey")}</label>
              <Input
                type={showApiKey ? "text" : "password"}
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder={t("agentConfig.apiKeyPlaceholder")}
                className="es-input"
                trailingSlot={
                  <IconButton
                    icon={showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    onClick={() => setShowApiKey(!showApiKey)}
                    size="sm"
                    aria-label={t("common.toggleVisibility", "切换可见性")}
                  />
                }
              />
              <p className="es-hint">
                {isEditing
                  ? t("agentConfig.apiKeyEditHint")
                  : t("agentConfig.apiKeyHint")}
              </p>
            </div>
            <div className="es-field">
              <label className="es-label">
                {t("agentConfig.modelApiBase")}
              </label>
              <Input
                type="text"
                value={formApiBase}
                onChange={(e) => setFormApiBase(e.target.value)}
                placeholder={t("agentConfig.modelApiBasePlaceholder")}
                className="es-input"
              />
            </div>
            <div className="es-row es-row-3">
              <div className="es-field">
                <label className="es-label">
                  {t("agentConfig.temperature")}
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={formTemperature}
                  onChange={(e) => setFormTemperature(e.target.value)}
                  placeholder="0.7"
                  className="es-input"
                />
              </div>
              <div className="es-field">
                <label className="es-label">{t("agentConfig.maxTokens")}</label>
                <Input
                  type="number"
                  value={formMaxTokens}
                  onChange={(e) => setFormMaxTokens(e.target.value)}
                  placeholder="4096"
                  className="es-input"
                />
              </div>
              <div className="es-field">
                <label className="es-label">
                  {t("agentConfig.maxInputTokens")}
                </label>
                <Input
                  type="number"
                  value={formMaxInputTokens}
                  onChange={(e) => setFormMaxInputTokens(e.target.value)}
                  placeholder="200000"
                  className="es-input"
                />
              </div>
            </div>
            <div className="es-field">
              <label className="flex items-start gap-2 text-sm text-theme-text cursor-pointer">
                <Checkbox
                  checked={formSupportsVision}
                  onChange={() => setFormSupportsVision((checked) => !checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">
                    {t("agentConfig.supportsVision")}
                  </span>
                  <span className="es-hint block">
                    {t("agentConfig.supportsVisionHint")}
                  </span>
                </span>
              </label>
            </div>
            <div className="es-field">
              <label className="flex items-start gap-2 text-sm text-theme-text cursor-pointer">
                <Checkbox
                  checked={formSupportsImageGeneration}
                  onChange={() =>
                    setFormSupportsImageGeneration((checked) => !checked)
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">
                    {t("agentConfig.supportsImageGeneration")}
                  </span>
                  <span className="es-hint block">
                    {t("agentConfig.supportsImageGenerationHint")}
                  </span>
                </span>
              </label>
            </div>
            {formSupportsImageGeneration && (
              <div
                className="space-y-3 rounded-lg border p-3"
                style={{ borderColor: "var(--glass-border)" }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ["openai_images", IMAGE_GENERATION_PROFILE_TEMPLATES.openai_images],
                      [
                        "generic_openai_images",
                        IMAGE_GENERATION_PROFILE_TEMPLATES.generic_openai_images,
                      ],
                      ["siliconflow", IMAGE_GENERATION_PROFILE_TEMPLATES.siliconflow],
                    ] as const
                  ).map(([key, template]) => (
                    <Button
                      key={key}
                      size="sm"
                      onClick={() => applyImageTemplate(template)}
                      leftIcon={<FileJson2 size={13} />}
                      className="px-2 py-1 text-xs"
                    >
                      {t(`settings.imageGeneration.provider.${key}`)}
                    </Button>
                  ))}
                </div>
                <div className="es-field">
                  <label className="flex items-start gap-2 text-sm text-theme-text cursor-pointer">
                    <Checkbox
                      checked={formSupportsImageEdit}
                      onChange={() =>
                        setFormSupportsImageEdit((checked) => !checked)
                      }
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-medium">
                        {t("agentConfig.supportsImageEdit")}
                      </span>
                      <span className="es-hint block">
                        {t("agentConfig.supportsImageEditHint")}
                      </span>
                    </span>
                  </label>
                </div>
                <div className="es-field">
                  <label className="es-label">
                    {t("agentConfig.imageProvider")}
                  </label>
                  <Select
                    value={formImageProvider}
                    onChange={setFormImageProvider}
                    options={IMAGE_PROVIDER_OPTIONS.map((option) => ({
                      value: option.value,
                      label: t(option.labelKey, {
                        provider: option.value,
                      }),
                    }))}
                  />
                  <ImageGenerationProviderHint provider={formImageProvider} />
                </div>
                <div className="es-row es-row-2">
                  <div className="es-field">
                    <label className="es-label">
                      {t("agentConfig.imageGenerationEndpoint")}
                    </label>
                    <Input
                      type="text"
                      value={formGenerationEndpoint}
                      onChange={(e) => setFormGenerationEndpoint(e.target.value)}
                      placeholder="/images/generations"
                      className="es-input"
                    />
                  </div>
                  <div className="es-field">
                    <label className="es-label">
                      {t("agentConfig.imageEditEndpoint")}
                    </label>
                    <Input
                      type="text"
                      value={formEditEndpoint}
                      onChange={(e) => setFormEditEndpoint(e.target.value)}
                      placeholder="/images/edits"
                      className="es-input"
                    />
                  </div>
                </div>
                <div className="es-row es-row-2">
                  <div className="es-field">
                    <label className="es-label">
                      {t("agentConfig.imageGenerationParameters")}
                    </label>
                    <Textarea
                      value={formGenerationParameters}
                      onChange={(e) => setFormGenerationParameters(e.target.value)}
                      rows={4}
                      className="es-input font-mono text-xs"
                    />
                  </div>
                  <div className="es-field">
                    <label className="es-label">
                      {t("agentConfig.imageEditParameters")}
                    </label>
                    <Textarea
                      value={formEditParameters}
                      onChange={(e) => setFormEditParameters(e.target.value)}
                      rows={4}
                      className="es-input font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="es-field">
                  <label className="es-label">
                    {t("agentConfig.imageParameterMap")}
                  </label>
                  <Textarea
                    value={formParameterMap}
                    onChange={(e) => setFormParameterMap(e.target.value)}
                    rows={4}
                    placeholder='{"n":"batch_size"}'
                    className="es-input font-mono text-xs"
                  />
                </div>
                <div className="es-row es-row-2">
                  <div className="es-field">
                    <label className="es-label">
                      {t("agentConfig.imageMaxN")}
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={formImageMaxN}
                      onChange={(e) => setFormImageMaxN(e.target.value)}
                      placeholder="10"
                      className="es-input"
                    />
                  </div>
                  <div className="es-field">
                    <label className="es-label">
                      {t("agentConfig.maxInputImages")}
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={formMaxInputImages}
                      onChange={(e) => setFormMaxInputImages(e.target.value)}
                      placeholder="16"
                      className="es-input"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </details>
      </div>
    </EditorSidebar>
  );
};
