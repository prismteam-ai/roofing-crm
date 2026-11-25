import { useEffect, useId, useState, type ReactNode } from 'react';

interface NumberFieldProps {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  /** When true an empty box means "no value" and commits null. */
  allowEmpty?: boolean;
  integer?: boolean;
  disabled?: boolean;
  placeholder?: string;
  suffix?: string;
  testId: string;
  className?: string;
  onCommit: (value: number | null) => void;
}

function parse(
  text: string,
  props: Pick<NumberFieldProps, 'min' | 'max' | 'integer'>,
): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < props.min || n > props.max) return null;
  return props.integer && !Number.isInteger(n) ? null : n;
}

/**
 * Number box that only reports valid values. While the text is out of range it is marked
 * invalid and nothing is committed; leaving the box restores the last good value.
 */
export function NumberField(props: NumberFieldProps) {
  const { label, value, min, max, step, allowEmpty, disabled, placeholder, suffix, testId } = props;
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setText((current) =>
      parse(current, props) === value && !(value === null && current.trim() !== '')
        ? current
        : value === null
          ? ''
          : String(value),
    );
    // Re-sync only when the committed value changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const parsed = parse(text, props);
  const invalid = text.trim() === '' ? !allowEmpty : parsed === null;

  return (
    <div className={`field ${props.className ?? ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="field-row">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={text}
          min={min}
          max={max}
          step={step ?? 'any'}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          data-testid={testId}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const n = parse(next, props);
            if (n !== null) props.onCommit(n);
            else if (next.trim() === '' && allowEmpty) props.onCommit(null);
          }}
          onBlur={() => {
            if (invalid) setText(value === null ? '' : String(value));
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  testId: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: T) => void;
}

export function SelectField<T extends string>(props: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className={`field ${props.className ?? ''}`}>
      <label htmlFor={id} className="field-label">
        {props.label}
      </label>
      <select
        id={id}
        value={props.value}
        disabled={props.disabled}
        data-testid={props.testId}
        onChange={(event) => {
          const picked = props.options.find((option) => option.value === event.target.value);
          if (picked) props.onChange(picked.value);
        }}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Notice({
  kind,
  children,
  action,
  testId,
}: {
  kind: 'error' | 'info' | 'success' | 'warn';
  children: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className={`notice notice-${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      data-testid={testId}
    >
      <div className="notice-body">{children}</div>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}
