import { motion, useReducedMotion } from 'framer-motion';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { cn } from '../../lib/cn';
import { hoverLift } from '../../lib/motion';

type DivProps = Omit<ComponentProps<'div'>, 'ref'> & { ref?: Ref<HTMLDivElement> };

export type CardVariant = 'default' | 'raised' | 'glass' | 'flat' | 'brand';

const variants: Record<CardVariant, string> = {
  default: 'card',
  raised: 'card shadow-[var(--shadow-e3)]',
  glass: 'card card-glass',
  flat: 'card card-flat',
  /** Tinted feature card for hero/brand moments (empty states, upsells, CTAs). */
  brand: 'card border-transparent bg-brand-soft shadow-none',
};

export interface CardProps extends DivProps {
  variant?: CardVariant;
  /** Adds hover lift + pointer affordance. Implied for `href` cards. */
  interactive?: boolean;
  /** Padding preset. `none` when the card hosts a table or list. */
  pad?: 'none' | 'sm' | 'md' | 'lg';
}

const pads = { none: '', sm: 'p-3.5', md: 'p-[1.125rem]', lg: 'p-6' } as const;

/**
 * Card — the workhorse surface. Elevation, hairline sheen and a 2dp hover lift
 * come from the `.card` component layer; `interactive` adds the pointer motion.
 */
export function Card({ className, variant = 'default', interactive, pad = 'none', children, ref, ...props }: CardProps) {
  const reduce = useReducedMotion();
  if (interactive) {
    return (
      <motion.div
        ref={ref}
        className={cn(variants[variant], pads[pad], 'cursor-pointer', className)}
        whileHover={reduce ? undefined : hoverLift.whileHover}
        whileTap={reduce ? undefined : hoverLift.whileTap}
        transition={hoverLift.transition}
        {...(props as object)}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <div ref={ref} className={cn(variants[variant], pads[pad], className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: DivProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-[1.125rem] pt-[1.125rem] pb-2.5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, as: As = 'h3', ...props }: DivProps & { as?: 'h2' | 'h3' | 'h4' }) {
  return (
    <As className={cn('font-display text-lg font-bold leading-snug text-ink', className)} {...props}>
      {children}
    </As>
  );
}

export function CardDescription({ className, children, ...props }: DivProps) {
  return (
    <p className={cn('mt-0.5 text-sm text-ink-muted', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: DivProps) {
  return (
    <div className={cn('px-[1.125rem] pb-[1.125rem]', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: DivProps) {
  return (
    <div
      className={cn('flex items-center justify-between gap-2 border-t border-line px-[1.125rem] py-3', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Full-bleed header row for cards that host tables/lists (no inner padding). */
export function CardToolbar({ className, children, ...props }: DivProps) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-between gap-2 border-b border-line px-[1.125rem] py-3', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('overline', className)}>{children}</div>;
}
