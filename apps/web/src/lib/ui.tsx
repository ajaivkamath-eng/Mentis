import { NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import type { Permission, Role } from '@mentis/core';
import { switchableRoles } from '@mentis/core';
import { LayoutDashboard, CalendarDays, Users, ClipboardList, Wallet, Trophy, Inbox, Settings, Search, LogOut, Moon, Sun } from 'lucide-react';
import { useState, type ReactElement } from 'react';

export function Protected({ perm, children }: { perm?: Permission; children: ReactElement }) {
  const { userId, staff, role, loading, canDo } = useAuth();
  if (loading) return <div className="p-8">Loading…</div>;
  if (!userId) return <Navigate to="/login" replace />;
  if (!staff) return <div className="p-8">No Mentis staff record — ask a Super Admin to assign your roles.</div>;
  if (!role) return <div className="p-8">No role assigned.</div>;
  if (perm && !canDo(perm)) return <div className="p-8">Not permitted for the {role} role.</div>;
  return children;
}

export function RoleSwitcher() {
  const { roles, role, setRole } = useAuth();
  const options = switchableRoles(roles);
  if (options.length <= 1) return <span className="badge" style={{ background: 'var(--line)' }}>{role}</span>;
  return (
    <select className="input" style={{ width: 'auto' }} value={role ?? ''} onChange={(e) => setRole(e.target.value as Role)} aria-label="Active role">
      {options.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}

const NAV: { to: string; label: string; icon: ReactElement; perm?: Permission }[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/today', label: 'Today', icon: <CalendarDays size={18} />, perm: 'sessions.assigned' },
  { to: '/sessions', label: 'Sessions', icon: <CalendarDays size={18} />, perm: 'sessions.manage' },
  { to: '/members', label: 'Members', icon: <Users size={18} />, perm: 'customers.view' },
  { to: '/tasks', label: 'Tasks', icon: <ClipboardList size={18} />, perm: 'tasks.viewOwn' },
  { to: '/billing', label: 'Billing', icon: <Wallet size={18} />, perm: 'billing.viewOwn' },
  { to: '/events', label: 'Events', icon: <Trophy size={18} />, perm: 'events.viewOwn' },
  { to: '/inbox', label: 'Inbox', icon: <Inbox size={18} />, perm: 'actions.closeOwn' },
  { to: '/diary-manage', label: 'Diary', icon: <CalendarDays size={18} />, perm: 'diary.manage' },
  { to: '/staffing', label: 'Staffing', icon: <Users size={18} />, perm: 'staffing.manage' },
  { to: '/availability', label: 'Availability', icon: <CalendarDays size={18} />, perm: 'availability.recordSelf' },
  { to: '/venues', label: 'Venues', icon: <Settings size={18} />, perm: 'venues.manage' },
  { to: '/import', label: 'Import', icon: <Search size={18} />, perm: 'sessions.manage' },
  { to: '/reports', label: 'Reports', icon: <Search size={18} />, perm: 'billing.viewAll' },
  { to: '/bookings', label: 'Bookings', icon: <Trophy size={18} />, perm: 'events.manage' },
  { to: '/progress', label: 'Progress', icon: <Trophy size={18} />, perm: 'events.manage' },
  { to: '/search', label: 'Search', icon: <Search size={18} /> },
  { to: '/settings', label: 'Settings', icon: <Settings size={18} />, perm: 'org.manage' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { staff, canDo, signOut } = useAuth();
  const [dark, setDark] = useState(true);
  return (
    <div className={dark ? 'dark' : ''} style={{ minHeight: '100vh' }}>
      <div className="flex" style={{ minHeight: '100vh' }}>
        <aside className="card hidden md:flex flex-col gap-1 p-3 m-3" style={{ width: 220, borderRadius: '1rem' }}>
          <div className="px-2 py-3 font-black text-xl">Mentis <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>· Kingfisher</span></div>
          {NAV.filter((n) => !n.perm || canDo(n.perm) || n.to === '/').map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="navlink">{n.icon}{n.label}</NavLink>
          ))}
          <div className="mt-auto flex flex-col gap-2">
            <RoleSwitcher />
            <div className="text-xs px-1" style={{ color: 'var(--muted)' }}>{staff?.display_name}</div>
            <button className="btn btn-ghost" onClick={() => setDark((d) => !d)}>{dark ? <Sun size={16} /> : <Moon size={16} />} Theme</button>
            <button className="btn btn-ghost" onClick={signOut}><LogOut size={16} /> Sign out</button>
          </div>
        </aside>
        <main className="flex-1 p-4 md:p-6" style={{ maxWidth: 1200 }}>{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div><h1 className="text-2xl font-black">{title}</h1>{sub && <p className="text-sm" style={{ color: 'var(--muted)' }}>{sub}</p>}</div>
      <div>{right}</div>
    </div>
  );
}
