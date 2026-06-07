import type { ReactNode } from "react";

/**
 * Predefined semantic color tokens for StatusBadge.
 * Each token maps to (bg, text, dot) classes.
 *
 * Conventions used across the app:
 *   - stone  = neutral / inactive / paused
 *   - emerald/green = positive / active / success
 *   - blue   = informational / scheduled / running
 *   - red    = negative / expired / failed
 *   - amber  = warning / timeout
 */
export type StatusColor =
  | "stone"
  | "emerald"
  | "green"
  | "blue"
  | "red"
  | "amber";

export interface StatusBadgeProps {
  /** Semantic color token */
  color?: StatusColor;
  /** Status text to display (already translated by caller) */
  label: ReactNode;
  /** Size variant */
  size?: "sm" | "md";
}

const COLOR_MAP: Record<
  StatusColor,
  { bg: string; text: string; dot: string }
> = {
  stone: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-500 dark:text-stone-400",
    dot: "bg-stone-400",
  },
  emerald: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  green: {
    bg: "bg-green-100 dark:bg-green-900/40",
    text: "text-green-700 dark:text-green-400",
    dot: "bg-green-500",
  },
  blue: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  red: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  amber: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
};

const SIZE_MAP = {
  sm: "px-2 py-0.5",
  md: "px-2.5 py-1",
};

/**
 * A reusable status pill with a colored dot indicator.
 * Replaces 6+ independent StatusBadge implementations across panels.
 */
export function StatusBadge({
  color = "stone",
  label,
  size = "md",
}: StatusBadgeProps) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.stone;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${SIZE_MAP[size]} text-xs font-medium ${c.bg} ${c.text}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}
