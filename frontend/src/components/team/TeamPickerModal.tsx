import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Users, Plus, Check, X } from "lucide-react";
import { useSwipeToClose } from "../../hooks/useSwipeToClose";
import { teamApi } from "../../services/api/team";
import type { Team } from "../../types/team";

interface TeamPickerModalProps {
  isOpen: boolean;
  selectedTeamId: string | null;
  onSelect: (teamId: string | null) => void;
  onClose: () => void;
  onCreateNew: () => void;
}

export function TeamPickerModal({
  isOpen,
  selectedTeamId,
  onSelect,
  onClose,
  onCreateNew,
}: TeamPickerModalProps) {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const sheetRef = useSwipeToClose({ onClose });

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      teamApi
        .list(0, 50)
        .then((res) => setTeams(res.teams))
        .catch((err) => console.error("Failed to load teams:", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelect = useCallback(
    (teamId: string) => {
      onSelect(teamId);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleCreateNew = useCallback(() => {
    onCreateNew();
    onClose();
  }, [onCreateNew, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        data-yields-sidebar
        className="fixed inset-0 z-[300] bg-black/50 animate-fade-in"
        onClick={onClose}
      />
      <div
        className="fixed z-[301] sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 inset-x-0 bottom-0 animate-slide-up sm:animate-scale-in"
        onClick={onClose}
      >
        <div
          ref={sheetRef as React.Ref<HTMLDivElement>}
          className="sm:rounded-2xl rounded-t-2xl shadow-2xl w-full sm:w-[40%] sm:min-w-[400px] min-h-[30vh] sm:max-h-[70vh] max-h-[85vh] max-h-[85dvh] flex flex-col overflow-hidden"
          style={{ background: "var(--theme-bg-card)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b relative"
            style={{ borderColor: "var(--theme-border)" }}
          >
            <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-stone-300 dark:bg-stone-600 sm:hidden" />
            <div className="flex items-center gap-3 mt-2 sm:mt-0">
              <div className="size-9 sm:size-10 rounded-xl bg-gradient-to-br from-stone-100 to-stone-200 dark:from-blue-500/20 dark:to-indigo-500/20 flex items-center justify-center">
                <Users
                  size={16}
                  className="text-stone-500 dark:text-blue-400 sm:w-[18px] sm:h-[18px]"
                />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-stone-900 dark:text-stone-100 font-serif">
                  {t("team.selectTeam", "选择团队")}
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {t("team.selectTeamDesc", "选择一个团队进行协作")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 sm:mt-0">
              <button
                onClick={handleCreateNew}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-stone-900 dark:bg-stone-600 text-white dark:text-stone-100 hover:bg-stone-800 dark:hover:bg-stone-500 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {t("common.new", "新建")}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 active:bg-stone-200 dark:active:bg-stone-600 transition-colors"
              >
                <X size={18} className="text-stone-400 dark:text-stone-500" />
              </button>
            </div>
          </div>

          {/* Team list */}
          <div className="flex-1 overflow-y-auto py-2 sm:py-4 px-4 space-y-1.5">
            {loading && (
              <p className="text-sm text-stone-400 dark:text-stone-500 text-center py-8">
                {t("common.loading", "加载中...")}
              </p>
            )}
            {!loading && teams.length === 0 && (
              <p className="text-sm text-stone-400 dark:text-stone-500 text-center py-8">
                {t("team.noTeams", "暂无团队。创建一个团队以开始协作。")}
              </p>
            )}
            {!loading &&
              teams.map((team) => {
                const isActive = team.id === selectedTeamId;
                return (
                  <button
                    key={team.id}
                    type="button"
                    className={`flex w-full items-center gap-3 px-3 sm:px-3.5 py-3 sm:py-3.5 rounded-xl text-left transition-all duration-200 ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/15"
                        : "hover:bg-stone-50 dark:hover:bg-stone-700/30 active:bg-stone-100/80 dark:active:bg-stone-600/40"
                    }`}
                    onClick={() => handleSelect(team.id)}
                  >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 bg-white dark:bg-stone-700 shadow-sm border border-stone-100 dark:border-stone-600">
                      <Users
                        size={17}
                        className={`sm:w-[18px] sm:h-[18px] ${
                          isActive
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-stone-500 dark:text-stone-400"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-[13px] sm:text-sm font-medium truncate block ${
                          isActive
                            ? "text-blue-700 dark:text-blue-400"
                            : "text-stone-700 dark:text-stone-200"
                        }`}
                      >
                        {team.name}
                      </span>
                      <p className="text-xs text-stone-400 dark:text-stone-500 truncate mt-0.5 leading-relaxed">
                        {team.members.filter((m) => m.enabled).length}{" "}
                        {t("team.members", "成员")}
                      </p>
                    </div>
                    {isActive && (
                      <div className="w-5 h-5 rounded-full bg-blue-500 dark:bg-blue-500 flex items-center justify-center shrink-0">
                        <Check
                          size={12}
                          className="text-white"
                          strokeWidth={3}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-t border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-800/50 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-stone-900 dark:bg-stone-600 text-white dark:text-stone-100 rounded-xl font-medium text-sm hover:bg-stone-800 dark:hover:bg-stone-500 active:bg-stone-700 dark:active:bg-stone-600 transition-colors"
            >
              {t("common.done", "完成")}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
