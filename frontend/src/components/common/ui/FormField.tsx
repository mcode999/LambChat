import type { ReactNode } from "react";

export interface FormFieldProps {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function FormField({
  label,
  required = false,
  hint,
  error,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cx("ui-field", className)}>
      {label && (
        <label className="ui-field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ui-field__required">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="ui-field__error">{error}</p>
      ) : hint ? (
        <p className="ui-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
