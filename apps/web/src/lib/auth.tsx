import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { can, switchableRoles, type Permission, type Role } from '@mentis/core';
import { DEMO_USER_ID, demoStaff, endDemoSession, isDemoSession } from './demo';

export interface StaffRow { id: string; organization_id: string; user_id: string; roles: Role[]; display_name: string }

interface AuthState {
  userId: string | null;
  staff: StaffRow | null;
  role: Role | null;
  roles: Role[];
  loading: boolean;
  setRole: (r: Role) => void;
  canDo: (p: Permission) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffRow | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Design-review mode: a local, backend-free Super Admin session.
    if (isDemoSession()) {
      setUserId(DEMO_USER_ID);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) { setStaff(null); setRole(null); setLoading(false); return; }
    if (isDemoSession()) {
      setStaff(demoStaff);
      setRole((r) => r ?? (switchableRoles(demoStaff.roles)[0] ?? null));
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase.from('mentis_staff').select('*').eq('user_id', userId).limit(1).single()
      .then(({ data }) => {
        setStaff((data as StaffRow) ?? null);
        setRole((r) => r ?? (data ? switchableRoles(data.roles as Role[])[0] ?? null : null));
        setLoading(false);
      });
  }, [userId]);

  const value = useMemo<AuthState>(() => ({
    userId, staff, role, roles: staff?.roles ?? [], loading,
    setRole, canDo: (p) => (role ? can(role, p) : false),
    signOut: async () => {
      if (isDemoSession()) {
        endDemoSession();
        window.location.href = '/login';
        return;
      }
      await supabase.auth.signOut();
    },
  }), [userId, staff, role, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
