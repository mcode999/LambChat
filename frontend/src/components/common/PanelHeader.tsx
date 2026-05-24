/**
 * 统一的面板头部组件
 * 用于所有管理面板的标题和操作区域
 */

import { type ReactNode } from "react";
import { Search } from "lucide-react";
import { PanelSearchInput } from "./PanelSearchInput";

interface PanelHeaderProps {
  /** 面板标题 */
  title: string;
  /** 副标题/描述 */
  subtitle?: string;
  /** 标题图标 */
  icon?: ReactNode;
  /** 右侧操作按钮区域 */
  actions?: ReactNode;
  /** 搜索值 */
  searchValue?: string;
  /** 搜索变化回调 */
  onSearchChange?: (value: string) => void;
  /** 搜索占位符 */
  searchPlaceholder?: string;
  /** 搜索区域右侧附加控件 */
  searchAccessory?: ReactNode;
  /** 额外的头部内容 */
  children?: ReactNode;
  /** 额外 class */
  className?: string;
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  actions,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchAccessory,
  children,
  className,
}: PanelHeaderProps) {
  return (
    <div className={className ? `panel-header ${className}` : "panel-header"}>
      <div className="flex flex-wrap items-center justify-between gap-3 lg:gap-4">
        <div className="flex min-w-0 items-center gap-3 lg:gap-4">
          {icon && (
            <div className="[&>svg]:size-5 flex size-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-theme-bg-subtle to-theme-bg text-theme-text-secondary shadow-sm ring-1 ring-stone-200/60 lg:[&>svg]:size-[22px] lg:size-14 dark:from-theme-bg-subtle dark:to-theme-bg dark:text-theme-text-secondary dark:ring-stone-700/50">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-theme-text font-serif lg:text-xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 truncate text-sm leading-snug text-theme-text-secondary lg:text-[0.85rem]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-nowrap flex-shrink-0 items-center gap-1.5 sm:gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* 搜索框 */}
      {onSearchChange !== undefined && (
        <div className="mt-2 flex items-center gap-2 sm:mt-3 lg:mt-4">
          <div className="relative min-w-0 flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-tertiary"
            />
            <PanelSearchInput
              type="text"
              value={searchValue}
              onValueChange={onSearchChange}
              className="panel-search h-10"
              placeholder={searchPlaceholder}
            />
          </div>
          {searchAccessory}
        </div>
      )}

      {/* 额外内容 */}
      {children}
    </div>
  );
}

export default PanelHeader;
