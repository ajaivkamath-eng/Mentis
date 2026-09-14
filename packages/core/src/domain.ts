/* Mentis shared domain model — single source of truth for entities/enums.
 * NOTE: some entity names (Ranking, Taster, Holiday, WeeklySchedule,
 * Action, Feedback) live in their feature modules to keep `export *`
 * conflict-free. This file holds the rest. */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'COACH' | 'SPARRER';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'taster';
export type StaffingColour = 'GREEN' | 'AMBER' | 'RED';
export type Capacity = 'lead' | 'assistant' | 'sparrer';

export interface Member {
  id: string; customerId?: string; dateOfBirth: string;
  specialNeedsFlag: boolean; specialNeeds?: string;
  nokName?: string; nokPhone?: string;
  // Round-8 profile extensions (all optional for backwards compat)
  name?: string; tteNumber?: string; handedness?: 'L' | 'R';
  playingStyle?: string; equipmentNotes?: string; photoRef?: string;
  sports?: { sportId: string; level?: string }[];
}
export interface Customer {
  id: string; name: string; phone?: string;
  email?: string; guardianA?: string; guardianB?: string;
  nokName?: string; nokPhone?: string; consents?: Consent[];
  isAlsoMemberId?: string;
}
export interface Consent {
  kind: 'medical' | 'photo' | 'marketing' | 'data';
  issuedAt: string; validUntil?: string; granted: boolean;
}
export interface Staff { id: string; userId: string; roles: Role[]; displayName?: string; specialties?: string[]; }
export interface Organization { id: string; name: string; }
export interface Venue {
  id: string; organizationId: string; name: string; address?: string;
  phone?: string; capacity?: number; concurrentSessionLimit: number; notes?: string;
}
export type SessionStatus = 'scheduled' | 'cancelled' | 'postponed' | 'completed';
export interface Session {
  id: string; organizationId: string; venueId: string; name: string;
  startAt: string; endAt: string; status: SessionStatus;
  levelBand?: string; capacity?: number; scheduleId?: string;
  cancelReason?: string;
}
export interface SessionSegment { id: string; sessionId: string; name: string; order: number; }
export type EnrollmentStatus = 'invited' | 'active' | 'paused' | 'waitlisted' | 'completed';
export interface Enrollment {
  id: string; sessionId: string; memberId: string;
  status: EnrollmentStatus; expected: boolean; position?: number;
  pauseReason?: string; autoResumeDate?: string;
}
export interface SessionAssignment {
  staffId: string; capacity: Capacity; rateCents: number; start: string; end: string;
  rateCardId?: string;
}
export interface SessionInstance {
  id: string; venueId: string; start: string; end: string;
  assignments: SessionAssignment[];
  status?: SessionStatus; overridden?: boolean;
}
export interface AttendanceRecord {
  id: string; sessionInstanceId: string; memberId?: string; tasterId?: string;
  status: AttendanceStatus; recordedAt: string; recordedBy: string; offline: boolean;
  notes?: string;
}
export type TimeEntryKind = 'planned' | 'actual' | 'standby';
export interface TimeEntry {
  id: string; staffId: string; date: string; start: string; end: string;
  hours: number; rateCents: number; billable: boolean;
  billState: 'unbilled' | 'billed'; pendingReview: boolean;
  kind?: TimeEntryKind; sessionId?: string; taskId?: string; source?: string;
  rateCardId?: string; standbyKept?: boolean;
}
export type TaskType = 'groupCoaching' | 'oneOnOne' | 'onDuty' | 'campaign' | 'other';
export type TaskStatus = 'todo' | 'inProgress' | 'done';
export interface Task {
  id: string; organizationId: string; title: string; type: TaskType;
  assigneeId?: string; groupId?: string; dueAt?: string; priority?: 'low' | 'normal' | 'high';
  status: TaskStatus; approvedAt?: string; approvedBy?: string;
  amountCents?: number; customerId?: string; chargeableToCustomer?: boolean;
  workHours?: number; sessionId?: string; recurrence?: string;
}
export interface RateCard {
  id: string; organizationId: string; staffId: string; label: string;
  rateCents: number; validFrom: string; notes?: string;
}
export interface AvailabilityBlock {
  id: string; staffId: string; startsAt: string; endsAt: string;
  available: boolean; reason?: string; recordedBy: string; recordedAt: string;
}
export interface StaffingExpectation { staffId: string; capacity: Capacity; }
export type EventSource = 'tte' | 'ittf_wtt' | 'club' | 'local' | 'manual';
export interface OrgEvent {
  id: string; organizationId: string; name: string; sportId: string;
  startsOn: string; endsOn: string; location?: string; entryDeadline?: string;
  source: EventSource; externalRef?: string; status: 'draft' | 'published' | 'completed' | 'cancelled';
}
export interface SubEvent { id: string; eventId: string; name: string; ageBand?: string; rankBand?: string; }
export type EntryStatus = 'suggested' | 'interested' | 'available' | 'confirmed' | 'notAvailable' | 'entered' | 'completed';
export interface EventEntry {
  id: string; eventId: string; memberId: string; subEventId?: string;
  status: EntryStatus; suggestedBy?: string; guardianConfirmed?: boolean;
}
export interface MatchRecord {
  id: string; memberId: string; date: string; eventId?: string;
  subEventId?: string; sessionId?: string; opponent: string;
  gamesFor: number[]; gamesAgainst: number[];
  result: 'W' | 'L' | 'D'; source: EventSource; sourceRef?: string;
}
export type GoalStatus = 'inProgress' | 'achieved' | 'missed';
export interface MemberGoal {
  id: string; memberId: string; description: string; type: 'free' | 'rank' | 'competition';
  targetDate?: string; status: GoalStatus;
}
export type ChargeStatus = 'pendingApproval' | 'approved' | 'recovered' | 'outstandingDebit';
export interface CustomerCharge {
  id: string; taskId: string; customerId: string; amountCents: number;
  status: ChargeStatus; dueDate?: string; approvedBy?: string; recoveredAt?: string;
}
export interface BillingLedgerLine {
  itemType: 'timeEntry' | 'task'; itemId: string; staffId: string;
  invoiceId?: string; status: 'unbilled' | 'billed';
}
export interface InvoiceLine {
  id: string; timeEntryId?: string; taskId?: string; staffId: string;
  hours: number; rateCents: number; amountCents: number; kind?: TimeEntryKind;
}
export type InvoiceStatus = 'draft' | 'pendingApproval' | 'approved' | 'paid';
export interface Invoice {
  id: string; staffId: string; periodStart: string; periodEnd: string;
  status: InvoiceStatus; lines: InvoiceLine[];
  approvedBy?: string; approvedAt?: string; paidAt?: string; paymentReference?: string;
}
export interface SportProfile {
  id: string; name: string;
  feedbackAttributeTemplates: Record<string, string[]>;
  rankSystem?: { type: string; levels: string[] };
  playingStyles?: string[]; presetChips?: { phrase: string; suggestedRatings?: Record<string, number> }[];
  equipmentGuide?: string; sessionTypeTemplates?: string[]; groupTemplates?: string[];
}
export interface Group { id: string; organizationId: string; venueId?: string; name: string; memberIds: string[]; staffIds: string[]; }
export type CommsKind = 'invitation' | 'reminder' | 'alert' | 'broadcast' | 'summary' | 'report';
export interface CommunicationLogEntry {
  id: string; kind: CommsKind; template: string; recipient: string;
  groupId?: string; sentAt: string; scheduledFor?: string;
}
export interface AuditEntry {
  id: string; organizationId: string; actorId?: string; action: string;
  entity: string; entityId?: string; field?: string; createdAt: string;
}
export interface BookingSlotDef {
  id: string; coachId: string; venueId: string; weekday: number;
  startTime: string; durationMinutes: number; fixedPriceCents: number;
  status: 'open' | 'closed';
}
export interface BookingDef {
  id: string; slotId: string; memberId: string; startsAt: string;
  status: 'booked' | 'approved' | 'completed' | 'cancelled';
  taskId?: string; cancellationWindowHours: number;
}
export interface ProgressReportDef {
  id: string; memberId: string; period: string; status: 'draft' | 'approved' | 'sent';
  pdfRef?: string; approvedBy?: string; sentAt?: string;
}
