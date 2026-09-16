import { Toaster as SonnerToaster, toast as sonner } from 'sonner';
import { useTheme } from '../../lib/theme';

/**
 * Toasts — the missing feedback channel.
 *
 * The original app reported results three different ways: `alert()`, a sentence
 * left on screen, or nothing at all. Every mutation now resolves into one of
 * these four verbs, each with the same rhythm and a themable surface.
 */

export interface ToastOptions {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export const toast = {
  success: (message: string, options?: ToastOptions) => sonner.success(message, options),
  error: (message: string, options?: ToastOptions) => sonner.error(message, options),
  info: (message: string, options?: ToastOptions) => sonner(message, options),
  warning: (message: string, options?: ToastOptions) => sonner.warning(message, options),
  /** For genuine in-flight work; returns an id usable with `toast.resolve`. */
  loading: (message: string, options?: ToastOptions) => sonner.loading(message, { ...options, duration: Infinity }),
  resolve: (id: string | number, message: string, ok = true) =>
    ok ? sonner.success(message, { id }) : sonner.error(message, { id }),
  dismiss: (id?: string | number) => sonner.dismiss(id),
  /** Undo affordance — the standard pattern for destructive-but-recoverable ops. */
  undoable: (message: string, onUndo: () => void) =>
    sonner(message, { duration: 8000, action: { label: 'Undo', onClick: onUndo } }),
};

/** Mounted once in main.tsx; inherits the active theme automatically. */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      offset={16}
      gap={10}
      visibleToasts={4}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'card !shadow-[var(--shadow-e3)] !bg-[var(--surface-raised)] !text-[var(--ink)] !border-[var(--border)] !rounded-xl !gap-3 !px-4 !py-3',
          title: '!text-sm !font-semibold !tracking-[-0.01em]',
          description: '!text-xs !text-[var(--ink-muted)]',
          actionButton: '!btn !btn-primary !h-7 !px-3 !text-xs',
          cancelButton: '!btn !btn-ghost !h-7 !px-3 !text-xs',
          closeButton: '!bg-[var(--surface-hover)] !border-[var(--border)] !text-[var(--ink-muted)]',
          icon: '!mt-0.5',
        },
      }}
    />
  );
}
