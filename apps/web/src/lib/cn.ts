import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn` — the one class-name helper the whole console uses.
 * clsx handles conditional composition; tailwind-merge makes later utilities win
 * over earlier conflicting ones ("px-4 px-6" → "px-6"), which is what lets our
 * components stay overridable without `!important` graffiti.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
