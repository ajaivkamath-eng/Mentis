/**
 * Data hooks shared by the tabs — counts for the tab badge, today's sessions,
 * and pull-to-refresh plumbing. All of them fail soft: with no connectivity the
 * screen shows its offline/empty state instead of an error screen.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface ActionCounts {
  open: number;
  breached: number;
  loading: boolean;
  refresh: () => void;
}

/** Counts of work waiting for this staff member — drives the Inbox tab badge. */
export function useActionCounts(staffId: string | undefined): ActionCounts {
  const [state, setState] = useState({ open: 0, breached: 0, loading: Boolean(staffId) });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      try {
        const [open, breached] = await Promise.all([
          supabase.from('pending_actions').select('id', { count: 'exact', head: true }).eq('assignee_id', staffId).neq('status', 'closed'),
          supabase.from('pending_actions').select('id', { count: 'exact', head: true }).eq('assignee_id', staffId).eq('status', 'breached'),
        ]);
        if (!cancelled) setState({ open: open.count ?? 0, breached: breached.count ?? 0, loading: false });
      } catch {
        if (!cancelled) setState({ open: 0, breached: 0, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refresh };
}

/** Days between now and a date, as a phrase used in list metadata. */
export function dueLabel(date: string | null | undefined): string {
  if (!date) return 'No due date';
  const diff = new Date(date).getTime() - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (Math.abs(diff) < 3_600_000) return 'Due within the hour';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days === -1) return 'Overdue by a day';
  if (days < 0) return `Overdue by ${Math.abs(days)} days`;
  return `Due in ${days} days`;
}
