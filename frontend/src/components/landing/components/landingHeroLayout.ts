export function getHeroSectionClassName(): string {
  return [
    "blog-hero",
    "relative",
    "flex",
    "min-h-[100svh]",
    "min-h-[100dvh]",
    "flex-col",
    "items-center",
    "justify-center",
    "overflow-hidden",
    "px-4",
    "pt-[calc(5rem+var(--app-safe-area-top,0px))]",
    "pb-20",
    "text-center",
    "sm:px-6",
    "sm:pt-28",
    "sm:pb-20",
  ].join(" ");
}
