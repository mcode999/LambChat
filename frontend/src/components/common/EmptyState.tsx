import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Lucide icon element or any ReactNode */
  icon: ReactNode;
  /** Primary text (already translated) */
  title: ReactNode;
  /** Secondary/hint text (already translated) */
  description?: ReactNode;
  /** Optional action slot (button, link, etc.) */
  action?: ReactNode;
  /** Extra CSS classes on root */
  className?: string;
}

/**
 * Shared empty-state placeholder used across panels.
 * Uses the `skill-empty-state` BEM classes defined in skill.css.
 *
 * Replaces 5+ inline duplications of the same HTML structure
 * in MarketplacePanel, SkillsList, ModelConfigTab, TeamRoster,
 * PersonaPlazaPanel, etc.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={`skill-empty-state ${className ?? ""}`}>
      <div className="skill-empty-state__icon">{icon}</div>
      <p className="skill-empty-state__title">{title}</p>
      {description && (
        <p className="skill-empty-state__description">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
