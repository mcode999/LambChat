import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  trailingSlot?: ReactNode;
  error?: boolean;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leadingIcon, trailingSlot, error = false, className, ...props },
  ref,
) {
  const input = (
    <input
      ref={ref}
      className={cx(
        "ui-input",
        Boolean(leadingIcon) && "ui-input--with-leading-icon",
        Boolean(trailingSlot) && "ui-input--with-trailing-slot",
        error && "ui-input--error",
        className,
      )}
      aria-invalid={error || props["aria-invalid"]}
      {...props}
    />
  );

  if (!leadingIcon && !trailingSlot) return input;

  return (
    <span className="ui-input-wrap">
      {leadingIcon && <span className="ui-input__leading">{leadingIcon}</span>}
      {input}
      {trailingSlot && (
        <span className="ui-input__trailing">{trailingSlot}</span>
      )}
    </span>
  );
});
