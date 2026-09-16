import { Search, X } from 'lucide-react';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { useId } from 'react';
import { cn } from '../../lib/cn';

type InputProps = Omit<ComponentProps<'input'>, 'ref'> & { ref?: Ref<HTMLInputElement> };

export function Input({ className, ...props }: InputProps) {
  return <input className={cn('input', className)} {...props} />;
}

export function Textarea({ className, ...props }: Omit<ComponentProps<'textarea'>, 'ref'> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea className={cn('input min-h-20 resize-y leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: Omit<ComponentProps<'select'>, 'ref'> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <select className={cn('input', className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: ComponentProps<'label'>) {
  return (
    <label className={cn('block text-xs font-semibold tracking-[0.01em] text-ink-muted', className)} {...props}>
      {children}
    </label>
  );
}

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Rendered to the right of the label (e.g. a "Forgot?" link). */
  action?: ReactNode;
  children: (ids: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/**
 * Field — label + control + hint/error wiring with generated ids.
 * Accessibility is the default rather than an afterthought: the control always
 * gets `aria-describedby` pointing at the hint, and `aria-invalid` on error.
 */
export function Field({ label, hint, error, required, className, action, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || action) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <Label htmlFor={id}>
              {label}
              {required && <span className="ml-0.5 text-danger">*</span>}
            </Label>
          )}
          {action}
        </div>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Input with a leading icon and an optional trailing slot / clear button. */
export function InputWithIcon({
  icon,
  onClear,
  className,
  value,
  ...props
}: InputProps & { icon?: ReactNode; onClear?: () => void }) {
  const hasValue = value != null && String(value).length > 0;
  return (
    <div className="relative flex items-center">
      <span aria-hidden className="pointer-events-none absolute left-2.5 flex text-ink-faint [&>svg]:size-4">
        {icon ?? <Search />}
      </span>
      <input className={cn('input pl-8.5', hasValue && onClear && 'pr-8', className)} value={value} {...props} />
      {hasValue && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear"
          className="absolute right-1.5 flex size-6 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Segmented, pill-style control. Used for role switching, list filters and
 * view toggles — implemented as a radiogroup for correct semantics.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; icon?: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-inset p-0.5',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors duration-150',
              size === 'sm' ? 'px-2.5 py-1 text-2xs' : 'px-3 py-1.5 text-xs',
              active ? 'text-brand-ink' : 'text-ink-faint hover:text-ink',
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-brand shadow-[var(--shadow-sm)] transition-all duration-200 ease-standard"
              />
            )}
            {o.icon && <span className="[&>svg]:size-3.5">{o.icon}</span>}
            {o.label}
            {o.count != null && <span className="tabular-nums opacity-70">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
