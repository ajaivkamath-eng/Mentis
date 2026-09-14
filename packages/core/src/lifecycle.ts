/* Taster journey, enrolment pause, waitlist (rules 12, 28). */
import type { Enrollment } from './domain.js';

export type TasterStatus = 'requested' | 'approved' | 'attended' | 'converted' | 'closed';
export type Taster = {
  id: string; name: string; age: number; status: TasterStatus;
  approvedSessionIds: string[];
  contact?: string; consent?: boolean; preferredSessionId?: string;
};
export function approveTaster(t: Taster, sessionIds: string[]): Taster {
  if (!sessionIds.length) throw new Error('at least one session is required');
  if (t.status !== 'requested') throw new Error('only requested tasters can be approved');
  return { ...t, status: 'approved', approvedSessionIds: [...new Set(sessionIds)] };
}
export function registerTaster(t: Taster, sessionId: string): boolean {
  return t.status === 'approved' && t.approvedSessionIds.includes(sessionId);
}
export function convertTaster(t: Taster): Taster {
  if (t.status !== 'attended' && t.status !== 'approved')
    throw new Error('taster must be approved or attended');
  return { ...t, status: 'converted' };
}
export type WaitlistEntry = { memberId: string; position: number };
/** Rule 28 — promotion is admin-triggered; never silent auto-promotion. */
export function promoteNextWaitlisted(
  entries: WaitlistEntry[], capacity: number, active: number,
): WaitlistEntry | null {
  if (active >= capacity) return null;
  return [...entries].sort((a, b) => a.position - b.position)[0] ?? null;
}

/** Rule 28 — paused enrolments are excluded from the expected list. */
export function expectedEnrollments(enrollments: Enrollment[]): Enrollment[] {
  return enrollments.filter((e) => e.expected && (e.status === 'active' || e.status === 'invited'));
}
export function pauseEnrollment(e: Enrollment, reason: string, autoResumeDate?: string): Enrollment {
  if (!reason.trim()) throw new Error('pause reason is required');
  return { ...e, status: 'paused', expected: false, pauseReason: reason, autoResumeDate };
}
export function resumeEnrollment(e: Enrollment): Enrollment {
  return { ...e, status: 'active', expected: true, pauseReason: undefined, autoResumeDate: undefined };
}
export function conversionPack(equipmentGuide: string, adminNote?: string): { welcome: string; guide: string; note?: string } {
  return {
    welcome: 'Welcome to Kingfisher Table Tennis Club! Here is what happens next: your first session, how to reach your coach, and what to bring.',
    guide: equipmentGuide,
    note: adminNote,
  };
}
