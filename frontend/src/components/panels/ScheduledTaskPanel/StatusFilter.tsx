import { useTranslation } from "react-i18next";
import { Filter } from "lucide-react";
import type { ScheduledTaskStatus as ScheduledTaskStatusType } from "../../../types/scheduledTask";
import { PanelFilterSelect } from "../../common";

const STATUS_OPTIONS: Array<{
  value: ScheduledTaskStatusType | "";
  labelKey: string;
}> = [
  { value: "", labelKey: "scheduledTask.allStatuses" },
  { value: "active", labelKey: "scheduledTask.active" },
  { value: "paused", labelKey: "scheduledTask.paused" },
];

export function StatusFilter({
  value,
  onChange,
}: {
  value: ScheduledTaskStatusType | undefined;
  onChange: (value: ScheduledTaskStatusType | undefined) => void;
}) {
  const { t } = useTranslation();

  const options = STATUS_OPTIONS.map((opt) => ({
    value: opt.value,
    label: (
      <>
        {opt.value ? null : <Filter size={14} />}
        <span className="panel-filter-trigger__label">{t(opt.labelKey)}</span>
      </>
    ),
  }));

  const normalizedValue = value ?? "";

  return (
    <div className="flex shrink-0 items-center" data-filter-menu>
      <PanelFilterSelect
        value={normalizedValue}
        onChange={(v) =>
          onChange((v || undefined) as ScheduledTaskStatusType | undefined)
        }
        options={options}
      />
    </div>
  );
}
