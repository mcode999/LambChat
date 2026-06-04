import { memo, useEffect, useState, useRef } from "react";

// Types for Excalidraw
interface ExcalidrawElement {
  id: string;
  [key: string]: unknown;
}

interface ExcalidrawAppState {
  viewBackgroundColor?: string;
  [key: string]: unknown;
}

// Cache for the export function
let exportToSvgFunc:
  | ((opts: {
      elements: readonly ExcalidrawElement[];
      appState?: ExcalidrawAppState;
    }) => Promise<SVGSVGElement>)
  | null = null;

interface ExcalidrawThumbnailProps {
  /** URL to the excalidraw file (.excalidraw / .exdraw) */
  url: string;
  alt?: string;
  className?: string;
}

/**
 * Async thumbnail renderer for Excalidraw files.
 * Fetches the JSON content, renders via exportToSvg, and displays the SVG as an <img>.
 * Used in AttachmentCard to show excalidraw previews alongside image thumbnails.
 */
export const ExcalidrawThumbnail = memo(function ExcalidrawThumbnail({
  url,
  alt = "",
  className,
}: ExcalidrawThumbnailProps) {
  const [svgBlobUrl, setSvgBlobUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const load = async () => {
      try {
        // Fetch excalidraw file content
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.text();

        // Parse excalidraw JSON
        const parsed = JSON.parse(raw);
        const elements: ExcalidrawElement[] = parsed.elements || parsed;
        const appState: ExcalidrawAppState = parsed.appState || {};

        if (!Array.isArray(elements) || elements.length === 0) {
          throw new Error("No elements");
        }

        // Load exportToSvg once
        if (!exportToSvgFunc) {
          const mod = await import("@excalidraw/excalidraw");
          exportToSvgFunc = mod.exportToSvg;
        }

        const exportFn = exportToSvgFunc;
        if (!exportFn) throw new Error("Export function unavailable");

        const svg = await exportFn({
          elements,
          appState: { ...appState, exportWithDarkMode: false },
        });

        // Serialize to blob URL for <img> rendering
        const svgString = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const blobUrl = URL.createObjectURL(blob);

        if (mountedRef.current) {
          setSvgBlobUrl(blobUrl);
        } else {
          URL.revokeObjectURL(blobUrl);
        }
      } catch {
        if (mountedRef.current) setHasError(true);
      }
    };

    load();

    return () => {
      mountedRef.current = false;
    };
  }, [url]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    if (!svgBlobUrl) return;
    return () => URL.revokeObjectURL(svgBlobUrl);
  }, [svgBlobUrl]);

  if (hasError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-800 rounded">
        <span className="text-xs text-stone-400 truncate px-1">{alt || "…"}</span>
      </div>
    );
  }

  if (!svgBlobUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center skeleton-line" />
    );
  }

  return (
    <img
      src={svgBlobUrl}
      alt={alt}
      className={className}
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
      }}
    />
  );
});
