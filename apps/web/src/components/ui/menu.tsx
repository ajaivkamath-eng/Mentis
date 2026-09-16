import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { scaleIn } from '../../lib/motion';

/* -------------------------------------------------------------------------- */
/* Tooltip — provider lives in main.tsx so every icon button can opt in        */
/* -------------------------------------------------------------------------- */

export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({
  label,
  children,
  side = 'bottom',
  delay = 250,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
}) {
  return (
    <RadixTooltip.Root delayDuration={delay}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content side={side} sideOffset={8} asChild>
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="show"
            exit="exit"
            className="z-[60] max-w-xs rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-ink shadow-[var(--shadow-e3)]"
          >
            {label}
            <RadixTooltip.Arrow className="fill-[var(--surface-raised)]" width={10} height={5} />
          </motion.div>
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* DropdownMenu                                                               */
/* -------------------------------------------------------------------------- */

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;
export const DropdownMenuGroup = RadixDropdown.Group;

export function DropdownMenuContent({
  className,
  children,
  sideOffset = 6,
  align = 'end',
  ...props
}: RadixDropdown.DropdownMenuContentProps) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content sideOffset={sideOffset} align={align} asChild {...props}>
        <motion.div
          variants={scaleIn}
          initial="hidden"
          animate="show"
          exit="exit"
          className={cn(
            'z-[60] min-w-52 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden',
            'rounded-xl border border-line bg-surface-raised p-1 shadow-[var(--shadow-e3)] backdrop-blur-xl',
            className,
          )}
        >
          {children}
        </motion.div>
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

const itemClasses =
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-muted outline-none transition-colors ' +
  'data-[highlighted]:bg-surface-hover data-[highlighted]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ' +
  '[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-ink-faint data-[highlighted]:[&>svg]:text-brand-text';

export function DropdownMenuItem({ className, ...props }: RadixDropdown.DropdownMenuItemProps) {
  return <RadixDropdown.Item className={cn(itemClasses, className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, ...props }: RadixDropdown.DropdownMenuCheckboxItemProps) {
  return <RadixDropdown.CheckboxItem className={cn(itemClasses, 'pl-8', className)} {...props} />;
}

export function DropdownMenuRadioItem({ className, ...props }: RadixDropdown.DropdownMenuRadioItemProps) {
  return <RadixDropdown.RadioItem className={cn(itemClasses, 'pl-8', className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: RadixDropdown.DropdownMenuLabelProps) {
  return <RadixDropdown.Label className={cn('overline px-2.5 py-1.5', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: RadixDropdown.DropdownMenuSeparatorProps) {
  return <RadixDropdown.Separator className={cn('my-1 h-px bg-line', className)} {...props} />;
}

export function DropdownMenuShortcut({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto rounded-[5px] border border-line bg-surface-inset px-1.5 py-0.5 font-mono text-2xs text-ink-faint">
      {children}
    </span>
  );
}
