/**
 * Demo dataset for the calendar-first coach diary.
 *
 * Enabled by the same design-review demo mode as the rest of the app
 * (no Supabase credentials). Everything is generated relative to *today*
 * so the week/month views are always alive: sessions with partial coach
 * allocations, tasks, regular-availability patterns, holidays, a sick-leave
 * conflict and rate cards. Deterministic ids keep tests honest.
 */
import {
  expandAvailabilityPattern, type AvailabilityRule, type CoachRole, type ConflictRecord,
  type DiaryEvent, type DiarySourceType, conflictMessage,
} from '@mentis/core';
import { addDays, dateKey, startOfWeek } from './model';

export interface DemoStaff { id: string; name: string; roles: string[]; initials: string }

export const DEMO_ME = 'staff-demo-me';

const staff: DemoStaff[] = [
  { id: DEMO_ME, name: 'Alex Morgan', roles: ['COACH'], initials: 'AM' },
  { id: 'staff-priya', name: 'Priya Sharma', roles: ['COACH'], initials: 'PS' },
  { id: 'staff-jordan', name: 'Jordan Lee', roles: ['COACH'], initials: 'JL' },
  { id: 'staff-sam', name: 'Sam Okafor', roles: ['SPARRER'], initials: 'SO' },
];

const rateCards = [
  { staffId: DEMO_ME, label: 'Level 3 head coach', rateCents: 4500 },
  { staffId: 'staff-priya', label: 'Level 2 coach', rateCents: 4000 },
  { staffId: 'staff-jordan', label: 'Level 1 coach', rateCents: 3800 },
];

const mon = startOfWeek(new Date());
const at = (i: number, hh: number, mm = 0) => {
  const d = addDays(mon, i);
  d.setHours(hh, mm, 0, 0);
  return d;
};
const iso = (d: Date) => d.toISOString();

interface SessionSeed {
  id: string; name: string; venue: string; dayIdx: number; start: [number, number]; end: [number, number];
  allocations: { staffId: string; role: CoachRole | 'lead' | 'assistant' | 'sparrer'; from: [number, number]; to: [number, number]; chargeable: boolean }[];
}

const sessionSeeds: SessionSeed[] = [
  {
    id: 'sess-u11', name: 'U11 Juniors', venue: 'Kingfisher Main Hall', dayIdx: 0, start: [18, 0], end: [19, 0],
    allocations: [
      { staffId: DEMO_ME, role: 'lead', from: [18, 0], to: [19, 0], chargeable: true },
      { staffId: 'staff-priya', role: 'assistant', from: [18, 0], to: [19, 0], chargeable: true },
    ],
  },
  {
    id: 'sess-adv', name: 'Advanced Squad', venue: 'Kingfisher Main Hall', dayIdx: 1, start: [18, 30], end: [20, 30],
    allocations: [{ staffId: DEMO_ME, role: 'lead', from: [18, 30], to: [20, 30], chargeable: true }],
  },
  {
    id: 'sess-beg', name: 'Beginners', venue: 'Kingfisher Main Hall', dayIdx: 2, start: [17, 0], end: [18, 0],
    allocations: [{ staffId: 'staff-priya', role: 'lead', from: [17, 0], to: [18, 0], chargeable: true }],
  },
  {
    id: 'sess-school', name: 'School Club Y5–6', venue: 'St Marys School', dayIdx: 3, start: [15, 30], end: [16, 30],
    allocations: [{ staffId: 'staff-jordan', role: 'lead', from: [15, 30], to: [16, 30], chargeable: true }],
  },
  {
    id: 'sess-split', name: 'Saturday Club', venue: 'Kingfisher Main Hall', dayIdx: 5, start: [9, 0], end: [12, 0],
    allocations: [
      { staffId: 'staff-priya', role: 'lead', from: [9, 0], to: [10, 30], chargeable: true },
      { staffId: 'staff-jordan', role: 'lead', from: [10, 30], to: [12, 0], chargeable: true },
      { staffId: 'staff-sam', role: 'sparrer', from: [9, 0], to: [12, 0], chargeable: true },
    ],
  },
  // Next week: overlaps Alex's holiday → conflict example.
  {
    id: 'sess-u11-next', name: 'U11 Juniors', venue: 'Kingfisher Main Hall', dayIdx: 7, start: [18, 0], end: [19, 0],
    allocations: [
      { staffId: DEMO_ME, role: 'lead', from: [18, 0], to: [19, 0], chargeable: true },
      { staffId: 'staff-priya', role: 'assistant', from: [18, 0], to: [19, 0], chargeable: true },
    ],
  },
];

const taskSeeds = [
  { id: 'task-plan', title: 'Term planning — autumn block', staffId: DEMO_ME, dayIdx: 3, start: [10, 0], end: [11, 30], rateCents: 2500, chargeable: false },
  { id: 'task-stock', title: 'Equipment stocktake', staffId: 'staff-jordan', dayIdx: 2, start: [13, 0], end: [15, 0], rateCents: 1900, chargeable: true },
];

export function buildDemoDiary(): {
  staff: DemoStaff[];
  events: DiaryEvent[];
  rules: AvailabilityRule[];
  conflicts: ConflictRecord[];
  rateCards: typeof rateCards;
} {
  const events: DiaryEvent[] = [];
  let n = 0;
  const id = (p: string) => `${p}-${(n++).toString(36)}`;
  const nameOf = (sid: string) => staff.find((s) => s.id === sid)?.name ?? sid;
  const rateOf = (sid: string) => rateCards.find((r) => r.staffId === sid);

  for (const s of sessionSeeds) {
    for (const a of s.allocations) {
      const role: CoachRole = a.role === 'sparrer' ? 'spare' : a.role;
      const rate = rateOf(a.staffId);
      events.push({
        id: id('sess'),
        staffId: a.staffId,
        staffName: nameOf(a.staffId),
        title: s.name,
        kind: 'session',
        coachRole: role,
        start: iso(at(s.dayIdx, a.from[0], a.from[1])),
        end: iso(at(s.dayIdx, a.to[0], a.to[1])),
        location: s.venue,
        sourceType: 'session',
        sourceId: s.id,
        system: true,
        chargeable: a.chargeable,
        rateCents: rate?.rateCents ?? null,
        rateLabel: rate?.label ?? null,
        linkTo: `/register/${s.id}`,
      });
    }
  }

  for (const t of taskSeeds) {
    const rate = rateOf(t.staffId);
    events.push({
      id: id('task'),
      staffId: t.staffId,
      staffName: nameOf(t.staffId),
      title: t.title,
      kind: 'task',
      start: iso(at(t.dayIdx, t.start[0], t.start[1])),
      end: iso(at(t.dayIdx, t.end[0], t.end[1])),
      sourceType: 'task',
      sourceId: t.id,
      system: true,
      chargeable: t.chargeable,
      rateCents: rate?.rateCents ?? null,
      rateLabel: rate?.label ?? null,
    });
  }

  // ---- manual diary entries -------------------------------------------------
  const manual = (
    staffId: string, title: string, kind: DiaryEvent['kind'],
    dayIdx: number, from: [number, number], to: [number, number],
    extra?: Partial<DiaryEvent>,
  ) => {
    events.push({
      id: id('ent'), staffId, staffName: nameOf(staffId), title, kind,
      start: iso(at(dayIdx, from[0], from[1])), end: iso(at(dayIdx, to[0], to[1])),
      sourceType: 'manual', ...extra,
    });
  };

  manual(DEMO_ME, 'Team leaders meeting', 'on_duty', 0, [12, 0], [13, 0], { notes: 'Weekly ops sync' });
  manual('staff-priya', 'Safeguarding refresher', 'training', 1, [10, 0], [12, 0], { location: 'Community Centre' });
  manual(DEMO_ME, 'Dentist', 'personal_appointment', 4, [16, 0], [17, 0]);
  manual('staff-jordan', 'County tournament duty', 'duty_outside_club', 5, [8, 0], [18, 0], { location: 'Norwich Sports Park', allDay: true });
  manual('staff-sam', 'Available for sparring', 'available', 5, [9, 0], [12, 0]);
  manual(DEMO_ME, 'Gym session', 'working_elsewhere', 2, [7, 0], [8, 30]);

  // Holiday for me — next Mon→Tue; overlaps next Monday's U11 session (conflict).
  const holStart = at(7, 0, 0);
  const holEnd = at(9, 0, 0);
  holEnd.setDate(holEnd.getDate() + 1);
  events.push({
    id: id('ent'), staffId: DEMO_ME, staffName: nameOf(DEMO_ME),
    title: 'Family trip — York', kind: 'holiday', allDay: true,
    start: iso(holStart), end: iso(holEnd), sourceType: 'manual', notes: 'Booked months ago',
  });

  // Sick leave for Priya this Wednesday — overlaps her Beginners session (conflict).
  events.push({
    id: id('ent'), staffId: 'staff-priya', staffName: nameOf('staff-priya'),
    title: 'Sick — rest advised', kind: 'sick_leave',
    start: iso(at(2, 14, 0)), end: iso(at(2, 20, 0)), sourceType: 'manual', notes: 'GP note on file',
  });

  // ---- regular availability patterns (Viva-Insights-style) -------------------
  const rules: AvailabilityRule[] = [
    {
      id: 'rule-alex', staffId: DEMO_ME, label: 'Regular availability',
      pattern: [
        { weekday: 1, windows: [{ start: '12:00', end: '20:00' }] },
        { weekday: 2, windows: [{ start: '16:00', end: '17:00' }] },
        { weekday: 3, windows: [{ start: '09:00', end: '13:00' }] },
        { weekday: 4, windows: [{ start: '14:00', end: '18:00' }] },
        { weekday: 5, windows: [] }, { weekday: 6, windows: [] }, { weekday: 7, windows: [] },
      ],
      effectiveFrom: dateKey(addDays(mon, -21)),
      effectiveTo: null,
      scope: 'indefinite',
      isActive: true,
    },
    {
      id: 'rule-priya', staffId: 'staff-priya', label: 'School-hours pattern',
      pattern: [
        { weekday: 1, windows: [{ start: '09:00', end: '15:00' }] },
        { weekday: 3, windows: [{ start: '09:00', end: '15:00' }] },
        { weekday: 5, windows: [{ start: '09:00', end: '12:00' }] },
        { weekday: 2, windows: [] }, { weekday: 4, windows: [] }, { weekday: 6, windows: [] }, { weekday: 7, windows: [] },
      ],
      effectiveFrom: dateKey(addDays(mon, -21)),
      effectiveTo: null,
      scope: 'indefinite',
      isActive: true,
    },
  ];

  // Materialise planner occurrences within ±2 weeks, like the live store does.
  const from = dateKey(addDays(mon, -14));
  const to = dateKey(addDays(mon, 14));
  for (const rule of rules) {
    for (const g of expandAvailabilityPattern(rule, from, to)) {
      events.push({
        id: `gen:${g.ruleId}:${g.date}:${g.startLocal.slice(11, 16)}`,
        staffId: g.staffId, staffName: nameOf(g.staffId),
        title: g.title, kind: g.kind,
        start: new Date(g.startLocal).toISOString(),
        end: new Date(g.endLocal).toISOString(),
        sourceType: 'planner', ruleId: g.ruleId, system: true,
        exceptionStatus: 'none',
      });
    }
  }

  // ---- conflicts ---------------------------------------------------------------
  const conflicts: ConflictRecord[] = [];
  const holiday = events.find((e) => e.title.startsWith('Family trip'))!;
  const clashed = events.find((e) => e.sourceId === 'sess-u11-next' && e.staffId === DEMO_ME)!;
  conflicts.push({
    staffId: DEMO_ME, staffName: nameOf(DEMO_ME),
    blocker: holiday, assignment: clashed,
    overlapMinutes: 60,
    message: conflictMessage(nameOf(DEMO_ME), holiday, clashed),
  });
  const sick = events.find((e) => e.kind === 'sick_leave')!;
  const sickSession = events.find((e) => e.sourceId === 'sess-beg')!;
  conflicts.push({
    staffId: 'staff-priya', staffName: nameOf('staff-priya'),
    blocker: sick, assignment: sickSession,
    overlapMinutes: 60,
    message: conflictMessage(nameOf('staff-priya'), sick, sickSession),
  });
  for (const c of conflicts) {
    c.blocker.conflictStatus = 'open';
    c.assignment.conflictStatus = 'open';
  }

  return { staff, events, rules, conflicts, rateCards };
}
