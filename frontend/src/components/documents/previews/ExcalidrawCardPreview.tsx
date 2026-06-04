import { useEffect, useState } from "react";
import { getFullUrl } from "../../../services/api";

/**
 * Renders a thumbnail preview of an excalidraw file on a file card.
 * Fetches JSON from URL, exports to SVG via @excalidraw/excalidraw,
 * renders as a blob-URL <img> for proper object-contain scaling.
 * Used by FileCardPreview for excalidraw file cards.
 */
export function ExcalidrawCardPreview({ url }: { url: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    const fullUrl = getFullUrl(url) ?? url;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(fullUrl);
        if (!res.ok || cancelled) return;
        const data = await res.text();
        if (cancelled) return;

        const parsed = JSON.parse(data);
        const elements = parsed.elements || parsed;
        if (!Array.isArray(elements)) return;

        // Lazy-load exportToSvg (shares the same module cache as ExcalidrawPreview)
        const { exportToSvg } = await import("@excalidraw/excalidraw");
        if (cancelled) return;

        const svg = await exportToSvg({
          elements,
          appState: {
            ...(parsed.appState || {}),
            exportWithDarkMode: false,
          },
        });

        const svgString = new XMLSerializer().serializeToString(svg);
        if (!cancelled) {
          const blob = new Blob([svgString], { type: "image/svg+xml" });
          setImgSrc(URL.createObjectURL(blob));
        }
      } catch {
        // Silent fail — card will just show the fallback cover
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    if (!imgSrc) return;
    return () => URL.revokeObjectURL(imgSrc);
  }, [imgSrc]);

  if (!imgSrc) return null;

  return (
    <img
      src={imgSrc}
      alt="Excalidraw diagram"
      className="h-full w-full object-contain transition-transform duration-300 group-hover/card:scale-[1.02]"
      loading="lazy"
      draggable={false}
    />
  );
}
