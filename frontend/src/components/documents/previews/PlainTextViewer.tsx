import { memo, useMemo } from "react";

interface PlainTextViewerProps {
  content: string;
}

const MAX_LINES = 10000;

const PlainTextViewer = memo(function PlainTextViewer({
  content,
}: PlainTextViewerProps) {
  const lines = useMemo(() => {
    const allLines = content.split("\n");
    if (allLines.length > MAX_LINES) {
      return allLines.slice(0, MAX_LINES);
    }
    return allLines;
  }, [content]);

  const isTruncated = content.split("\n").length > MAX_LINES;

  const lineCount = lines.length;
  const lineNumberWidth =
    lineCount >= 10000
      ? "4.5rem"
      : lineCount >= 1000
        ? "3.5rem"
        : lineCount >= 100
          ? "2.5rem"
          : "2rem";

  return (
    <div className="h-full overflow-auto bg-[var(--theme-bg)]">
      <pre
        className="text-xs sm:text-[13px] leading-[1.65] font-mono m-0 select-text"
        style={{
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={`flex ${
              i % 2 === 1 ? "bg-[var(--theme-primary-light)]" : ""
            }`}
          >
            <span
              className="select-none shrink-0 text-right pr-4 text-[11px] leading-[1.65] border-r border-[var(--theme-border)] text-[var(--theme-text-secondary)]"
              style={{ width: lineNumberWidth, minWidth: lineNumberWidth }}
            >
              {i + 1}
            </span>
            <span className="whitespace-pre text-[var(--theme-text)] pl-4">
              {line || " "}
            </span>
          </div>
        ))}
        {isTruncated && (
          <div className="mt-2 pl-4 text-[var(--theme-text-secondary)] text-xs">
            ... ({MAX_LINES} lines shown)
          </div>
        )}
      </pre>
    </div>
  );
});

export default PlainTextViewer;
