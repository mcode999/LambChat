import { LoadingSpinner } from "./LoadingSpinner";

interface PanelLoadingStateProps {
  text?: string;
  containerClassName?: string;
  className?: string;
}

export function PanelLoadingState({
  text,
  containerClassName = "h-full",
  className = "",
}: PanelLoadingStateProps) {
  return (
    <div
      className={`flex ${containerClassName} items-center justify-center ${className}`}
    >
      <div className="text-center">
        <div className="mx-auto mb-4">
          <LoadingSpinner
            size="lg"
            color="text-stone-400 dark:text-stone-500"
          />
        </div>
        {text ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">{text}</p>
        ) : null}
      </div>
    </div>
  );
}
