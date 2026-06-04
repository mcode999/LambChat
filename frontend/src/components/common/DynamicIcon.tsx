import { FluentEmoji } from "@lobehub/fluent-emoji";

// Legacy default icons → mapped to 💬 FluentEmoji
const LEGACY_DEFAULT_ICONS = new Set(["MessageCircle", "Bot", "📁"]);

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
      style={{ width: size, height: size, fontSize: size, lineHeight: 1 }}
    >
      <FluentEmoji emoji={icon} size={size} type="3d" />
    </span>
  );
}

// Dynamic icon renderer - all icons rendered as FluentEmoji 3D
export function DynamicIcon({
  name,
  size,
  className,
}: {
  name?: string;
  size?: number;
  className?: string;
}) {
  if (!name || LEGACY_DEFAULT_ICONS.has(name))
    return renderEmojiIcon("💬", size, className);
  // Check if it's an emoji (non-ASCII character, or no ASCII letters)
  const isEmoji = !/^[a-zA-Z]+$/.test(name);
  if (isEmoji) {
    return renderEmojiIcon(name, size, className);
  }
  // Unrecognized ASCII names fall back to 💬
  return renderEmojiIcon("💬", size, className);
}
