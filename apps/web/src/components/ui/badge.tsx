import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold leading-4 tracking-[0.02em] transition-colors',
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-surface-hover text-ink-muted',
        brand: 'border-transparent bg-brand-soft text-brand-text',
        success: 'border-transparent bg-success-soft text-success',
        warning: 'border-transparent bg-warning-soft text-warning',
        danger: 'border-transparent bg-danger-soft text-danger',
        info: 'border-transparent bg-info-soft text-info',
        accent: 'border-transparent bg-accent-soft text-accent',
        outline: 'border-line-strong bg-transparent text-ink-muted',
      },
      size: {
        sm: 'px-2 py-0.5 text-2xs',
        md: 'px-2.5 py-[3px] text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

export interface BadgeProps extends Omit<ComponentProps<'span'>, 'ref'>, VariantProps<typeof badgeVariants> {
  /** Leading status dot (inherits badge colour). */
  dot?: boolean;
  icon?: ReactNode;
}

export function Badge({ className, tone, size, dot, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current shadow-[0_0_0_3px_color-mix(in_oklab,currentColor_22%,transparent)]" />}
      {icon && <span className="[&>svg]:size-3">{icon}</span>}
      {children}
    </span>
  );
}

export { badgeVariants };
