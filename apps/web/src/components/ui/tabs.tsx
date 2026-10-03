import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

/** Accessible tab primitives with the Mentis segmented-control visual language. */
export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root {...props} />;
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface-inset p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors',
        'hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]',
        'data-[state=active]:bg-surface-raised data-[state=active]:text-brand-text data-[state=active]:shadow-[var(--shadow-sm)]',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]', className)} {...props} />;
}
