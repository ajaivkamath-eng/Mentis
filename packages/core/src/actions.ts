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
