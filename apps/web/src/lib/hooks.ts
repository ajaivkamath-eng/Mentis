import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Persisted boolean/JSON state (sidebar collapse, dismissed banners, …). */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof localStorage === 'undefined') return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Debounce any fast-changing value (search boxes, resize). */
export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export interface AlertCount {
  breached: number;
  open: number;
  loading: boolean;
  refresh: () => void;
}

/**
 * Counts the work waiting for this user — drives the header bell.
 * Fails soft: if Supabase isn't reachable (offline, no env) the badge simply
 * stays empty instead of breaking the shell.
 */
export function useAlertCount(enabled = true): AlertCount {
  const [state, setState] = useState({ breached: 0, open: 0, loading: enabled });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const [breached, open] = await Promise.all([
          supabase.from('mentis_pending_actions').select('id', { count: 'exact', head: true }).eq('status', 'breached'),
          supabase.from('mentis_pending_actions').select('id', { count: 'exact', head: true }).in('status', ['open', 'breached']),
        ]);
        if (!cancelled) setState({ breached: breached.count ?? 0, open: open.count ?? 0, loading: false });
      } catch {
        if (!cancelled) setState({ breached: 0, open: 0, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refresh };
}

/** Relative time ("in 2h", "3 days ago") for dues and activity feeds. */
export function useRelativeTime(date: string | number | Date | null | undefined) {
  if (!date) return '—';
  const then = new Date(date).getTime();
  const diff = then - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60_000],
    ['hour', 3_600_000],
    ['day', 86_400_000],
    ['week', 604_800_000],
    ['month', 2_629_800_000],
    ['year', 31_557_600_000],
  ];
  const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  if (abs < 60_000) return 'just now';
  let chosen: [Intl.RelativeTimeFormatUnit, number] = units[0];
  for (const u of units) if (abs >= u[1]) chosen = u;
  return rtf.format(Math.round(diff / chosen[1]), chosen[0]);
}
