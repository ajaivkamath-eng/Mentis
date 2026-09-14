/* RBAC matrix — UI mirror of the DB RLS floor (§4 access matrix).
 * The UI can never grant more than the SELECTED role; the DB enforces the
 * UNION of the user's roles. Single source of truth for nav gating. */
import type { Role } from './domain.js';

export type Permission =
  | 'org.manage' | 'users.manage'
  | 'venues.manage' | 'venues.view'
  | 'staff.manage' | 'staff.self'
  | 'customers.manage' | 'customers.view' | 'customers.registerView'
  | 'sessions.manage' | 'sessions.assigned' | 'sessions.viewOwn'
  | 'attendance.mark' | 'attendance.view'
  | 'tasters.manage' | 'tasters.viewOwn'
  | 'tasks.approve' | 'tasks.create' | 'tasks.viewOwn'
  | 'groups.manage' | 'groups.viewOwn'
  | 'events.manage' | 'events.viewOwn'
  | 'staffing.manage' | 'staffing.viewAssigned' | 'staffing.flagUnavailable'
  | 'availability.recordAll' | 'availability.recordSelf' | 'availability.recordForOthers'
  | 'timesheet.viewAll' | 'timesheet.self' | 'timesheet.viewSessionStaff'
  | 'rates.manage'
  | 'invoices.draft' | 'invoices.approve' | 'invoices.viewOwn'
  | 'billing.viewAll' | 'billing.viewOwn'
  | 'charges.manage' | 'charges.viewOwn'
  | 'diary.manage' | 'actions.closeAny' | 'actions.closeOwn' | 'actions.createManual'
  | 'medical.view' | 'gdpr.export' | 'gdpr.erase' | 'audit.view'
  | 'comms.broadcast' | 'devices.revoke';

const ALL: Record<Role, Permission[]> = {
  SUPER_ADMIN: ['org.manage', 'users.manage', 'venues.manage', 'venues.view', 'staff.manage', 'staff.self',
    'customers.manage', 'customers.view', 'sessions.manage', 'sessions.assigned', 'attendance.mark', 'attendance.view',
    'tasters.manage', 'tasks.approve', 'tasks.create', 'groups.manage', 'events.manage', 'staffing.manage',
    'availability.recordAll', 'availability.recordSelf', 'timesheet.viewAll', 'timesheet.self', 'timesheet.viewSessionStaff',
    'rates.manage', 'invoices.draft', 'invoices.approve', 'invoices.viewOwn', 'billing.viewAll', 'billing.viewOwn',
    'charges.manage', 'diary.manage', 'actions.closeAny', 'actions.closeOwn', 'actions.createManual',
    'medical.view', 'gdpr.export', 'gdpr.erase', 'audit.view', 'comms.broadcast', 'devices.revoke'],
  ADMIN: ['venues.manage', 'venues.view', 'staff.manage', 'customers.manage', 'customers.view', 'sessions.manage',
    'attendance.mark', 'attendance.view', 'tasters.manage', 'tasks.approve', 'tasks.create', 'groups.manage',
    'events.manage', 'staffing.manage', 'availability.recordAll', 'availability.recordSelf', 'timesheet.viewAll',
    'rates.manage', 'invoices.draft', 'invoices.approve', 'billing.viewAll', 'charges.manage', 'diary.manage',
    'actions.closeAny', 'actions.closeOwn', 'actions.createManual', 'medical.view', 'gdpr.export', 'gdpr.erase',
    'audit.view', 'comms.broadcast', 'devices.revoke'],
  COACH: ['venues.view', 'staff.self', 'customers.view', 'sessions.assigned', 'attendance.mark', 'attendance.view',
    'tasters.viewOwn', 'tasks.create', 'tasks.viewOwn', 'groups.viewOwn', 'events.manage', 'staffing.viewAssigned',
    'staffing.flagUnavailable', 'availability.recordSelf', 'availability.recordForOthers', 'timesheet.self',
    'timesheet.viewSessionStaff', 'invoices.draft', 'invoices.viewOwn', 'billing.viewOwn', 'charges.viewOwn',
    'actions.closeOwn', 'actions.createManual', 'medical.view'],
  SPARRER: ['venues.view', 'staff.self', 'customers.registerView', 'sessions.viewOwn', 'tasks.create', 'tasks.viewOwn',
    'groups.viewOwn', 'events.viewOwn', 'staffing.viewAssigned', 'availability.recordSelf', 'timesheet.self',
    'actions.closeOwn', 'actions.createManual', 'medical.view'],
};

export function permissionsFor(role: Role): ReadonlySet<Permission> {
  return new Set(ALL[role]);
}
/** Union of all held roles = the DB security floor. */
export function permissionsUnion(roles: Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of ALL[r]) out.add(p);
  return out;
}
/** UI gate: selected role only (never more than the active role). */
export function can(selectedRole: Role, permission: Permission): boolean {
  return ALL[selectedRole].includes(permission);
}
/** Role switcher options = the roles the user actually holds. */
export function switchableRoles(held: Role[]): Role[] {
  const order: Role[] = ['SUPER_ADMIN', 'ADMIN', 'COACH', 'SPARRER'];
  return order.filter((r) => held.includes(r));
}
