/**
 * Small floating layer used for quick-create, event details and paste options —
 * compact popovers instead of big modal forms, anchored where the user acted.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface Anchor { x: number; y: number }

export function FloatingCard({
  anchor, onClose, children, className, width = 320, label,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  width?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    const margin = 8;
    let left = anchor.x + 12;
    let top = anchor.y - 12;
    if (left + w > window.innerWidth - margin) left = Math.max(margin, anchor.x - w - 12);
    if (top + h > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - h - margin);
    if (top < margin) top = margin;
    setPos({ left, top, ready: true });
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown, true); };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={cn(
        'fixed z-50 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-[var(--shadow-lg)]',
        'motion-safe:animate-[pop_.16s_ease-out] transition-opacity',
        !pos.ready && 'opacity-0',
        className,
      )}
      style={{ left: pos.left, top: pos.top, width }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-1.5 top-1.5 rounded-md p-1 text-ink-faint hover:bg-surface-hover hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
      {children}
    </div>
  );
}

/** Renders text with a leading coloured dot. */
export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />;
}
