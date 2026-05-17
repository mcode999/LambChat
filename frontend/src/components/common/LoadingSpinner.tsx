export type LoadingSize = "xs" | "sm" | "md" | "lg" | "xl";

interface LoadingSpinnerProps {
  size?: LoadingSize;
  className?: string;
  static?: boolean;
  color?: string;
}

const sizeMap: Record<LoadingSize, number> = {
  xs: 12,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 40,
};

export function LoadingSpinner({
  size = "md",
  className = "",
  static: isStatic = false,
  color = "",
}: LoadingSpinnerProps) {
  const sizeValue = sizeMap[size];

  return (
    <svg
      width={sizeValue}
      height={sizeValue}
      viewBox="0 0 24 24"
      fill="none"
      className={`${color || "text-stone-500 dark:text-stone-300"} ${
        isStatic ? "" : "spinner-rotate"
      } ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.12"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="16 47"
      />
    </svg>
  );
}

interface LoadingProps {
  text?: string;
  size?: LoadingSize;
  className?: string;
}

export function Loading({ text, size = "md", className = "" }: LoadingProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LoadingSpinner size={size} />
      {text && (
        <span
          className="text-sm"
          style={{ color: "var(--theme-text-secondary)" }}
        >
          {text}
        </span>
      )}
    </div>
  );
}
