import type { ReactNode } from "react";
import { Select } from "./ui";
import type { SelectOption } from "./ui";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface PanelFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  active?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
}

export function PanelFilterSelect({
  value,
  onChange,
  options,
  active = Boolean(value),
  disabled = false,
  className,
  triggerClassName,
  dropdownClassName,
}: PanelFilterSelectProps) {
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      className={cx("panel-filter-select", className)}
      triggerClassName={cx(
        "panel-filter-trigger h-10 px-3",
        active && "panel-filter-trigger--active",
        triggerClassName,
      )}
      dropdownClassName={cx("panel-filter-menu", dropdownClassName)}
    />
  );
}

export interface PanelFooterActionsProps {
  children: ReactNode;
  align?: "end" | "between";
  className?: string;
}

export function PanelFooterActions({
  children,
  align = "end",
  className,
}: PanelFooterActionsProps) {
  return (
    <div
      className={cx(
        "panel-footer-actions",
        align === "between" && "panel-footer-actions--between",
        className,
      )}
    >
      {children}
    </div>
  );
}
