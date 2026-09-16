import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { cn } from '../../lib/cn';
import { transition } from '../../lib/motion';

/**
 * Button — one component, five intents, four sizes.
 *
 * Micro-interactions
 *   hover   → 1px lift + shadow bloom (CSS layer, GPU-cheap)
 *   press   → spring-scaled 0.97 (Framer Motion, respects prefers-reduced-motion)
 *   loading → in-place skeleton spinner + aria-busy, never a layout jump
 */
const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)] ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      intent: {
        primary:
          'bg-brand text-brand-ink shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.22)] hover:shadow-[var(--shadow-glow)]',
        secondary:
          'bg-surface-raised text-ink border border-line hover:border-[var(--border-strong)] hover:bg-surface-hover',
        soft: 'bg-brand-soft text-brand-text hover:bg-[color-mix(in_oklab,var(--brand)_22%,transparent)]',
        ghost: 'text-ink-muted hover:bg-surface-hover hover:text-ink',
        danger: 'bg-danger-soft text-danger hover:bg-[color-mix(in_oklab,var(--danger)_24%,transparent)]',
        link: 'text-brand-text underline-offset-4 hover:underline px-0',
      },
      size: {
        sm: 'h-8 rounded-sm px-3 text-xs',
        md: 'h-9 rounded-md px-3.5 text-sm',
        lg: 'h-11 rounded-lg px-5 text-base',
        icon: 'h-9 w-9 rounded-md p-0',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { intent: 'secondary', size: 'md', block: false },
  },
);

/** React's DOM drag/animation handlers collide with Framer Motion's signatures. */
type MotionConflicts = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration';

export interface ButtonProps
  extends Omit<ComponentProps<'button'>, 'ref' | MotionConflicts>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. `<Link>`) while keeping button styling. */
  asChild?: boolean;
  /** Shows a spinner and blocks interaction. */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  intent,
  size,
  block,
  asChild,
  loading = false,
  iconLeft,
  iconRight,
  children,
  disabled,
  ref,
  ...props
}: ButtonProps) {
  const reduce = useReducedMotion();
  const classes = cn(buttonVariants({ intent, size, block }), className);

  const inner = (
    <>
      {loading ? (
        <Loader2 aria-hidden className="size-4 animate-spin-slow" />
      ) : (
        iconLeft && <span className="[&>svg]:size-4 shrink-0">{iconLeft}</span>
      )}
      {children && <span className="truncate">{children}</span>}
      {iconRight && !loading && <span className="[&>svg]:size-4 shrink-0">{iconRight}</span>}
    </>
  );

  // Radix Slot must own the single child element, so we render a plain element
  // and let CSS handle the hover/press feedback in that (rare) case.
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} aria-busy={loading || undefined} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <motion.button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      whileTap={reduce || disabled || loading ? undefined : { scale: 0.97 }}
      whileHover={reduce || disabled || loading ? undefined : { y: -1 }}
      transition={transition.instant}
      {...props}
    >
      {inner}
    </motion.button>
  );
}

export { buttonVariants };
