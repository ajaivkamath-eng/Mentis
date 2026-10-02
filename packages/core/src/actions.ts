/* Actions engine: seeds + custom types, event/activity/manual triggers,
 * link-to-any-entity, configurable breach timelines (rules 9–10). */
export type ActionStatus = 'open' | 'breached' | 'closed';
export type Action = {
  id: string; dueAt: string; breachAt?: string; status: ActionStatus;
  actionTypeId?: string; title?: string; assigneeId?: string;
  linkedEntityType?: string; linkedEntityId?: string;
};
export function evaluateAction(action: Action, now: string): Action {
  if (action.status === 'closed') return action;
  if (action.breachAt && Date.parse(now) >= Date.parse(action.breachAt))
    return { ...action, status: 'breached' };
  return action;
}
export function closeAction(action: Action): Action {
  if (action.status === 'closed') return action;
  return { ...action, status: 'closed' };
}
export function actionTimeline(sessionStart: string, dueOffsetMs: number, breachOffsetMs: number) {
  const start = Date.parse(sessionStart);
  return {
    dueAt: new Date(start - dueOffsetMs).toISOString(),
    breachAt: new Date(start - breachOffsetMs).toISOString(),
  };
}

export type ActionTrigger = 'event' | 'activity' | 'manual';
export interface ActionTypeDef {
  id: string; name: string; description?: string; trigger: ActionTrigger;
  defaultDueOffsetMs: number; defaultBreachOffsetMs: number;
  allowedLinkTypes: string[]; alertRecipients: ('manager' | 'leadCoach' | 'assignee')[];
}
export const DAY_MS = 86_400_000;
/** Seed action types (§6.9). Defaults: due P1M, breach P1W before the session. */
export const SEED_ACTION_TYPES: Omit<ActionTypeDef, 'id'>[] = [
  { name: 'name replacement staff', trigger: 'event', defaultDueOffsetMs: 30 * DAY_MS, defaultBreachOffsetMs: 7 * DAY_MS, allowedLinkTypes: ['session'], alertRecipients: ['manager', 'leadCoach'] },
  { name: 'confirm staffing', trigger: 'event', defaultDueOffsetMs: 14 * DAY_MS, defaultBreachOffsetMs: 7 * DAY_MS, allowedLinkTypes: ['session'], alertRecipients: ['manager', 'leadCoach'] },
  { name: 'clear outstanding debit', trigger: 'event', defaultDueOffsetMs: 14 * DAY_MS, defaultBreachOffsetMs: 7 * DAY_MS, allowedLinkTypes: ['customer', 'invoice'], alertRecipients: ['manager'] },
  { name: 'backfill missing staff details', trigger: 'activity', defaultDueOffsetMs: 7 * DAY_MS, defaultBreachOffsetMs: 3 * DAY_MS, allowedLinkTypes: ['session', 'timesheet'], alertRecipients: ['manager'] },
  { name: 'review unbilled items', trigger: 'activity', defaultDueOffsetMs: 7 * DAY_MS, defaultBreachOffsetMs: 3 * DAY_MS, allowedLinkTypes: ['timesheet', 'task'], alertRecipients: ['manager'] },
];
/** Any manager & staff can create a manual action on others. */
export function createManualAction(
  input: { title: string; assigneeId: string; linkedEntityType: string; linkedEntityId: string; dueAt: string; breachAt?: string },
  actionTypeId: string,
): Action {
  if (!input.title.trim()) throw new Error('action title is required');
  return { id: `action-${Date.now()}`, status: 'open' as const, actionTypeId, ...input };
}

export type QualificationReminderStatus = 'valid' | 'expiring_soon' | 'expired';

export function qualificationReminderStatus(nowIso: string, expiresAtIso: string, reminderDays: number): QualificationReminderStatus {
  const now = Date.parse(nowIso);
  const expiresAt = Date.parse(expiresAtIso);
  if (Number.isNaN(now) || Number.isNaN(expiresAt)) return 'valid';
  const reminderMs = Math.max(0, reminderDays) * DAY_MS;
  const warningCutoff = expiresAt - reminderMs;
  if (now >= expiresAt) return 'expired';
  if (now >= warningCutoff) return 'expiring_soon';
  return 'valid';
}

export function qualificationDocumentStoragePath(input: {
  organizationId: string;
  staffId: string;
  qualificationTypeId: string;
  fileName: string;
}): string {
  const sanitizedName = (input.fileName || 'document').trim() || 'document';
  const safeName = sanitizedName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `${input.organizationId}/${input.staffId}/qualifications/${input.qualificationTypeId}/${dateStamp}_${safeName}`;
}

export type QualificationChecklistItem = {
  qualificationTypeId: string;
  name: string;
  category: string;
  required: boolean;
  requiresDocumentUpload: boolean;
  hasRecord: boolean;
  hasDocument: boolean;
  expiresAt?: string | null;
  status: QualificationReminderStatus;
  isComplete: boolean;
};

export function coachQualificationChecklistSummary(
  qualificationTypes: Array<{
    id: string;
    name: string;
    category?: string | null;
    is_mandatory?: boolean | null;
    requires_document_upload?: boolean | null;
    reminder_days?: number | null;
  }>,
  staffQualifications: Array<{
    qualification_type_id?: string | null;
    title?: string | null;
    expires_at?: string | null;
    document_url?: string | null;
    status?: string | null;
  }>,
  nowIso = new Date().toISOString(),
): QualificationChecklistItem[] {
  return qualificationTypes.map((type) => {
    const match = staffQualifications.find((entry) => entry.qualification_type_id === type.id);
    const expiresAt = match?.expires_at ?? null;
    const reminderDays = Math.max(0, Number(type.reminder_days ?? 30));
    const status = expiresAt ? qualificationReminderStatus(nowIso, expiresAt, reminderDays) : 'valid';
    const hasDocument = Boolean(match?.document_url && match.document_url.trim());
    const required = Boolean(type.is_mandatory);
    const isComplete = Boolean(
      match &&
      expiresAt &&
      status !== 'expired' &&
      (!type.requires_document_upload || hasDocument),
    );

    return {
      qualificationTypeId: type.id,
      name: type.name,
      category: type.category || 'certificate',
      required,
      requiresDocumentUpload: Boolean(type.requires_document_upload),
      hasRecord: Boolean(match),
      hasDocument,
      expiresAt,
      status,
      isComplete,
    };
  });
}

export function createQualificationReminderAction(input: {
  coachStaffId: string;
  qualificationTitle: string;
  expiresAt: string;
  reminderDays: number;
  organizationId: string;
}): { organizationId: string; assigneeId: string; title: string; dueAt: string; status: 'open' } {
  const normalizedTitle = input.qualificationTitle.trim();
  if (!normalizedTitle) throw new Error('qualification title is required');
  const dueAt = new Date(Date.parse(input.expiresAt) - Math.max(0, input.reminderDays) * DAY_MS).toISOString();
  return {
    organizationId: input.organizationId,
    assigneeId: input.coachStaffId,
    title: `Renew ${normalizedTitle}${normalizedTitle.toLowerCase().endsWith('certificate') || normalizedTitle.toLowerCase().endsWith('course') ? '' : ' certificate'}`,
    dueAt,
    status: 'open',
  };
}
