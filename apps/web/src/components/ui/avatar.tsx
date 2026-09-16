import { cn } from '../../lib/cn';

const sizes = {
  xs: 'size-6 text-2xs',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
} as const;

/** Deterministic gradient per person so the same member always looks the same. */
const gradients = [
  'linear-gradient(135deg,#2dd4bf,#0d9488)',
  'linear-gradient(135deg,#818cf8,#4f46e5)',
  'linear-gradient(135deg,#fbbf24,#d97706)',
  'linear-gradient(135deg,#60a5fa,#2563eb)',
  'linear-gradient(135deg,#f87171,#dc2626)',
  'linear-gradient(135deg,#34d399,#059669)',
];

function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string | null | undefined) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: keyof typeof sizes;
  /** Adds a 2px themed ring (used for the signed-in user chip). */
  ring?: boolean;
  className?: string;
}

export function Avatar({ name, src, size = 'md', ring, className }: AvatarProps) {
  const initials = initialsOf(name);
  const bg = gradients[hash(name ?? initials) % gradients.length];

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-display font-bold text-white/95',
        sizes[size],
        ring && 'ring-2 ring-[var(--surface)] outline outline-1 outline-[var(--border-strong)]',
        className,
      )}
      style={{ background: bg }}
      aria-hidden={!name}
      title={name ?? undefined}
    >
      {src ? <img src={src} alt={name ?? ''} className="size-full object-cover" loading="lazy" /> : initials}
    </span>
  );
}
