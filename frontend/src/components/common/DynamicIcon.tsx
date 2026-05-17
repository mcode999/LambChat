import { FluentEmoji } from "@lobehub/fluent-emoji";
import * as LucideIcons from "lucide-react";

function renderEmojiIcon(
  icon: string,
  size?: number,
  className?: string,
  extraClasses?: string,
) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center overflow-hidden",
        extraClasses,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size }}
    >
      <FluentEmoji emoji={icon} size={size} type="3d" />
    </span>
  );
}

// Dynamic icon renderer - supports lucide icons, emojis via FluentEmoji, and fallback emoji
export function DynamicIcon({
  name,
  size,
  className,
  fill,
}: {
  name?: string;
  size?: number;
  className?: string;
  fill?: string;
}) {
  if (!name) return renderEmojiIcon("📁", size, className);
  if (name === "Star") {
    return renderEmojiIcon("⭐", size, className);
  }
  // Check if it's an emoji (non-ASCII character, or no ASCII letters)
  const isEmoji = !/^[a-zA-Z]+$/.test(name);
  if (isEmoji) {
    return renderEmojiIcon(name, size, className);
  }
  const IconComponent = (
    LucideIcons as unknown as Record<
      string,
      React.ComponentType<{ size?: number; className?: string; fill?: string }>
    >
  )[name];
  return IconComponent ? (
    <IconComponent size={size} className={className} fill={fill} />
  ) : (
    renderEmojiIcon("📁", size ? size * 0.9 : undefined, className)
  );
}
