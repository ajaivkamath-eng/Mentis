import type { Role } from '@mentis/core';
import type { StaffRow } from './auth';

/**
 * Demo / design-review mode.
 *
 * Enabled automatically when the app is built in dev without Supabase
 * credentials (the common local-first case), or explicitly with `VITE_DEMO=1`.
 * It signs you in as a Super Admin with no backend, so the shell, navigation,
 * ⌘K palette and the design-system page can be reviewed without a database.
 *
 * It never fakes data: queries simply return nothing, which is why every page
 * has a real empty/error state instead of a spinner that never resolves.
 */
const DEMO_FLAG = 'mentis.demoSession';

export const demoEnabled =
  (import.meta.env.DEV && !import.meta.env.VITE_SUPABASE_URL) || import.meta.env.VITE_DEMO === '1';

export const DEMO_USER_ID = 'demo-user-0000';

export const demoStaff: StaffRow = {
  id: 'demo-staff-0000',
  organization_id: 'demo-org-0000',
  user_id: DEMO_USER_ID,
  display_name: 'Demo Super Admin',
  roles: ['SUPER_ADMIN', 'ADMIN', 'COACH', 'SPARRER'] as Role[],
};

export function isDemoSession() {
  if (!demoEnabled) return false;
  try {
    return localStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
}

export function startDemoSession() {
  try {
    localStorage.setItem(DEMO_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function endDemoSession() {
  try {
    localStorage.removeItem(DEMO_FLAG);
  } catch {
    /* ignore */
  }
}
