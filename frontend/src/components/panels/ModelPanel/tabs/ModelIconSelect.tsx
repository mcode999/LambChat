import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModelIconImg } from "../../../agent/modelIcon.tsx";
import { modelIconSlugs } from "../../../agent/modelIcon";
import { PROVIDER_LABELS } from "../../AgentPanel/shared/ProviderSelect";

interface ModelIconSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const ModelIconSelect = React.memo(function ModelIconSelect({
  value,
  onChange,
  placeholder = "",
}: ModelIconSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const label = (slug: string) => PROVIDER_LABELS[slug] || slug;
  const selected = modelIconSlugs.includes(value) ? value : null;

  const filtered = useMemo(() => {
    if (!search.trim()) return modelIconSlugs;
    const q = search.toLowerCase();
    return modelIconSlugs.filter(
      (slug) => slug.includes(q) || label(slug).toLowerCase().includes(q),
    );
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="glass-input w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-left dark:text-stone-100 cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected ? (
            <ModelIconImg model={selected} icon={selected} size={18} />
          ) : (
            <div className="w-[18px] h-[18px] flex items-center justify-center rounded-full bg-stone-200 dark:bg-stone-600">
              <span className="text-[10px] font-bold text-stone-500 dark:text-stone-300">
                ?
              </span>
            </div>
          )}
          <span
            className={selected ? "" : "text-stone-400 dark:text-stone-500"}
          >
            {selected ? label(selected) : placeholder}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`text-stone-400 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full rounded-xl bg-white dark:bg-stone-800 shadow-lg border border-[var(--glass-border)] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="px-3 pt-2.5 pb-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search", "搜索...")}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-stone-50 dark:bg-stone-700/60 border border-stone-200/60 dark:border-stone-600/40 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-stone-400 dark:focus:border-stone-500"
              />
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto overscroll-contain">
            <button
              type="button"
              onClick={() => handleSelect("")}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left hover:bg-stone-100/80 dark:hover:bg-stone-700/50 transition-colors ${
                !value ? "bg-stone-50 dark:bg-stone-700/30" : ""
              }`}
            >
              <div className="w-[18px] h-[18px] flex items-center justify-center rounded-full bg-stone-200 dark:bg-stone-600 shrink-0">
                <span className="text-[10px] font-bold text-stone-500 dark:text-stone-300">
                  ?
                </span>
              </div>
              <span className="text-stone-500 dark:text-stone-400">
                {placeholder}
              </span>
            </button>

            {filtered.map((slug) => (
              <button
                key={slug}
                type="button"
                onClick={() => handleSelect(slug)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left hover:bg-stone-100/80 dark:hover:bg-stone-700/50 transition-colors ${
                  value === slug ? "bg-stone-50 dark:bg-stone-700/30" : ""
                }`}
              >
                <ModelIconImg model={slug} icon={slug} size={18} />
                <span className="text-stone-700 dark:text-stone-200">
                  {label(slug)}
                </span>
                <span className="text-xs text-stone-400 dark:text-stone-500 ml-auto font-mono">
                  {slug}
                </span>
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="px-3.5 py-4 text-sm text-stone-400 dark:text-stone-500 text-center">
                {t("agentConfig.noModelIcons")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
