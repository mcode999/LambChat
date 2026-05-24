import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type InputHTMLAttributes,
} from "react";

type PanelSearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> & {
  value?: string;
  onValueChange: (value: string) => void;
};

export const PanelSearchInput = forwardRef<
  HTMLInputElement,
  PanelSearchInputProps
>(function PanelSearchInput(
  {
    value = "",
    onValueChange,
    onFocus,
    onBlur,
    onCompositionStart,
    onCompositionEnd,
    ...props
  },
  ref,
) {
  const [draftValue, setDraftValue] = useState(value);
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraftValue(value);
    }
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value;
    setDraftValue(nextValue);
    onValueChange(nextValue);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    isEditingRef.current = true;
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    isEditingRef.current = false;
    if (draftValue !== value) {
      onValueChange(draftValue);
    }
    onBlur?.(event);
  };

  const handleCompositionStart = (
    event: CompositionEvent<HTMLInputElement>,
  ) => {
    isEditingRef.current = true;
    onCompositionStart?.(event);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value;
    setDraftValue(nextValue);
    onValueChange(nextValue);
    onCompositionEnd?.(event);
  };

  return (
    <input
      {...props}
      ref={ref}
      value={draftValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  );
});

export default PanelSearchInput;
