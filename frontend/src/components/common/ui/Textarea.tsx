import type { TextareaHTMLAttributes } from "react";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Textarea({
  error = false,
  className,
  ...props
}: TextareaProps) {
  return (
    <textarea
      className={cx("ui-textarea", error && "ui-textarea--error", className)}
      aria-invalid={error || props["aria-invalid"]}
      {...props}
    />
  );
}
