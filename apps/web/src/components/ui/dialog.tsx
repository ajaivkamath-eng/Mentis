import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { drawerVariants, scaledSheetVariants, scrimVariants, transition } from '../../lib/motion';

/* Radix strips exit animations by unmounting content immediately, so we keep the
   `open` flag in our own context and render with `forceMount` + AnimatePresence. */
const DialogCtx = createContext<{ open: boolean }>({ open: false });

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogCtx.Provider value={{ open }}>
      <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
        {children}
      </RadixDialog.Root>
    </DialogCtx.Provider>
  );
}

export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

const sizeMap = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

/**
 * DialogContent — glass scrim + spring-scaled panel.
 * Web equivalent of the native `ModalSheet`: same 0.96→1 scale, same 220ms,
 * so a confirmation feels identical on desktop and phone.
 */
export function DialogContent({
  className,
  children,
  size = 'md',
  hideClose,
  ...props
}: RadixDialog.DialogContentProps & { size?: keyof typeof sizeMap; hideClose?: boolean }) {
  const { open } = useContext(DialogCtx);
  return (
    <AnimatePresence>
      {open && (
        <RadixDialog.Portal forceMount>
          <RadixDialog.Overlay asChild forceMount>
            <motion.div
              variants={scrimVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="fixed inset-0 z-40 bg-scrim backdrop-blur-[3px]"
            />
          </RadixDialog.Overlay>
          <RadixDialog.Content asChild forceMount {...props}>
            <motion.div
              variants={scaledSheetVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className={cn(
                'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
                'card shadow-[var(--shadow-e4)]',
                'max-h-[90vh] overflow-y-auto',
                sizeMap[size],
                className,
              )}
            >
              {children}
              {!hideClose && (
                <RadixDialog.Close
                  className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </RadixDialog.Close>
              )}
            </motion.div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      )}
    </AnimatePresence>
  );
}

export function DialogHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-col gap-1 px-6 pt-6 pb-4', className)}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <RadixDialog.Title className={cn('font-display text-xl font-bold tracking-[-0.02em] text-ink', className)}>
      {children}
    </RadixDialog.Title>
  );
}

export function DialogDescription({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <RadixDialog.Description className={cn('text-sm leading-relaxed text-ink-muted', className)}>
      {children}
    </RadixDialog.Description>
  );
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-6 pb-5', className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4', className)}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheet — same machinery, anchored to an edge (mobile-first detail panels)   */
/* -------------------------------------------------------------------------- */

export function SheetContent({
  className,
  children,
  side = 'right',
  hideClose,
  ...props
}: RadixDialog.DialogContentProps & { side?: 'right' | 'left' | 'bottom'; hideClose?: boolean }) {
  const { open } = useContext(DialogCtx);
  const position =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl'
      : side === 'right'
        ? 'inset-y-0 right-0 h-full w-full sm:max-w-md rounded-l-2xl'
        : 'inset-y-0 left-0 h-full w-full sm:max-w-md rounded-r-2xl';

  return (
    <AnimatePresence>
      {open && (
        <RadixDialog.Portal forceMount>
          <RadixDialog.Overlay asChild forceMount>
            <motion.div
              variants={scrimVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="fixed inset-0 z-40 bg-scrim backdrop-blur-[3px]"
            />
          </RadixDialog.Overlay>
          <RadixDialog.Content asChild forceMount {...props}>
            <motion.div
              variants={side === 'bottom' ? scaledSheetVariants : drawerVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className={cn('fixed z-50 card overflow-y-auto shadow-[var(--shadow-e4)]', position, className)}
            >
              {children}
              {!hideClose && (
                <RadixDialog.Close
                  className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </RadixDialog.Close>
              )}
            </motion.div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      )}
    </AnimatePresence>
  );
}

/** Small helper for confirm-style dialogs (destructive actions, approvals). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <DialogBody>{children}</DialogBody>}
        <DialogFooter>
          <RadixDialog.Close asChild>
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={transition.instant}
              className="btn btn-ghost"
            >
              {cancelLabel}
            </motion.button>
          </RadixDialog.Close>
          <button
            className={cn('btn', destructive ? 'btn-danger' : 'btn-primary')}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewAndConfirmBanner({
  title,
  description,
  count,
  range,
  skipBankHolidays,
  skipTermHolidays,
  tone = 'neutral',
}: {
  title: string;
  description: string;
  count: number;
  range: string;
  skipBankHolidays?: boolean;
  skipTermHolidays?: boolean;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        tone === 'warning' ? 'border-danger/30 bg-danger-soft/10' : 'border-line bg-surface',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">{title}</div>
        {count >= 5 && (
          <div className="rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-[10px] font-bold text-danger">
            This will affect {count} dates
          </div>
        )}
      </div>

      <div className="mb-3 text-[12px] text-ink-muted">{description}</div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-line bg-surface-inset px-2 py-1 text-[10px] font-semibold text-ink-faint">
          {range}
        </span>
        {skipBankHolidays && (
          <span className="inline-flex items-center rounded-full border border-line bg-surface-inset px-2 py-1 text-[10px] font-semibold text-ink-faint">
            skips bank holidays
          </span>
        )}
        {skipTermHolidays && (
          <span className="inline-flex items-center rounded-full border border-line bg-surface-inset px-2 py-1 text-[10px] font-semibold text-ink-faint">
            skips term holidays
          </span>
        )}
      </div>
    </div>
  );
}
