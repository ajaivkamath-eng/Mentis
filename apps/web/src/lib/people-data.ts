/**
 * Small, deliberately local data set used by the disconnected design-review
 * session. It gives the people screens something useful to work with before a
 * Supabase project is connected; production and connected builds always read
 * from the real tables instead.
 */

export type PeopleTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

export interface DemoActivity {
  id: string;
  title: string;
  detail: string;
  date: string;
  tone: PeopleTone;
}

export interface DemoAttendance {
  id: string;
  date: string;
  session: string;
  venue: string;
  coach: string;
  status: 'present' | 'late' | 'absent';
}

export interface DemoGoal {
  id: string;
  description: string;
  status: 'inProgress' | 'achieved' | 'missed';
  targetDate: string;
  type: 'free' | 'rank' | 'competition';
}

export interface DemoMatch {
  id: string;
  date: string;
  opponent: string;
  result: 'W' | 'L' | 'D';
  event: string;
}

export interface DemoMemberSummary {
  id: string;
  name: string;
  dateOfBirth: string;
  memberCode: string;
  status: 'active' | 'atRisk' | 'inactive';
  attendancePct: number;
  sessionsAttended: number;
  sessionsTotal: number;
  lastAttended: string | null;
  nextSession: string | null;
  groups: string[];
  alert?: string;
}

export interface DemoCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  guardianA: string | null;
  guardianB: string | null;
  nokName: string | null;
  nokPhone: string | null;
  status: 'active' | 'attention' | 'inactive';
  memberIds: string[];
  lastContact: string;
  balanceCents: number;
  consentLabels: string[];
  activity: DemoActivity[];
}

export interface DemoMember extends DemoMemberSummary {
  customerId: string | null;
  customerName: string | null;
  handedness: 'L' | 'R' | null;
  playingStyle: string | null;
  equipmentNotes: string | null;
  specialNeedsFlag: boolean;
  createdAt: string;
  attendance: DemoAttendance[];
  goals: DemoGoal[];
  matches: DemoMatch[];
  feedback: { id: string; date: string; body: string; coach: string }[];
  timeline: DemoActivity[];
}

const customerSeed: DemoCustomer[] = [
  {
    id: 'demo-customer-sarah',
    name: 'Sarah Mitchell',
    phone: '+44 7700 900201',
    email: 'sarah.mitchell@example.com',
    guardianA: 'Sarah Mitchell',
    guardianB: null,
    nokName: 'Sarah Mitchell',
    nokPhone: '+44 7700 900201',
    status: 'active',
    memberIds: ['demo-member-ava', 'demo-member-oliver'],
    lastContact: '2026-09-16',
    balanceCents: 0,
    consentLabels: ['Photography', 'Email updates'],
    activity: [
      { id: 'sarah-1', title: 'Payment received', detail: 'September membership · £84.00', date: '2026-09-16', tone: 'success' },
      { id: 'sarah-2', title: 'Coach note shared', detail: 'Ava’s backhand block is progressing well', date: '2026-09-12', tone: 'brand' },
      { id: 'sarah-3', title: 'Booking confirmed', detail: 'Family review with Coach Jack', date: '2026-09-05', tone: 'info' },
    ],
  },
  {
    id: 'demo-customer-daniel',
    name: 'Daniel Okafor',
    phone: '+44 7700 900202',
    email: 'daniel.okafor@example.com',
    guardianA: 'Daniel Okafor',
    guardianB: 'Ngozi Okafor',
    nokName: 'Ngozi Okafor',
    nokPhone: '+44 7700 900203',
    status: 'attention',
    memberIds: ['demo-member-noah'],
    lastContact: '2026-09-10',
    balanceCents: 1200,
    consentLabels: ['Email updates'],
    activity: [
      { id: 'daniel-1', title: 'Payment needs review', detail: 'August make-up session · £12.00 outstanding', date: '2026-09-15', tone: 'warning' },
      { id: 'daniel-2', title: 'Absence reported', detail: 'Noah missed Tuesday development group', date: '2026-09-09', tone: 'danger' },
      { id: 'daniel-3', title: 'Email sent', detail: 'Attendance check-in', date: '2026-09-10', tone: 'info' },
    ],
  },
  {
    id: 'demo-customer-priya',
    name: 'Priya Shah',
    phone: '+44 7700 900204',
    email: 'priya.shah@example.com',
    guardianA: 'Priya Shah',
    guardianB: null,
    nokName: 'Priya Shah',
    nokPhone: '+44 7700 900204',
    status: 'active',
    memberIds: ['demo-member-maya'],
    lastContact: '2026-09-14',
    balanceCents: 0,
    consentLabels: ['Photography', 'Email updates', 'SMS reminders'],
    activity: [
      { id: 'priya-1', title: 'Goal achieved', detail: 'Maya completed her serve consistency block', date: '2026-09-14', tone: 'success' },
      { id: 'priya-2', title: 'Progress report sent', detail: 'Summer term review', date: '2026-09-02', tone: 'brand' },
    ],
  },
  {
    id: 'demo-customer-tom',
    name: 'Tom Wilson',
    phone: '+44 7700 900205',
    email: 'tom.wilson@example.com',
    guardianA: 'Tom Wilson',
    guardianB: null,
    nokName: 'Tom Wilson',
    nokPhone: '+44 7700 900205',
    status: 'active',
    memberIds: ['demo-member-tom'],
    lastContact: '2026-09-11',
    balanceCents: 0,
    consentLabels: ['Email updates'],
    activity: [
      { id: 'tom-1', title: '1-to-1 completed', detail: 'Serve receive and first-ball attack', date: '2026-09-11', tone: 'brand' },
      { id: 'tom-2', title: 'Booking confirmed', detail: 'Next 1-to-1 · 24 Sep', date: '2026-09-11', tone: 'info' },
    ],
  },
  {
    id: 'demo-customer-li',
    name: 'Li Chen',
    phone: '+44 7700 900206',
    email: 'li.chen@example.com',
    guardianA: 'Li Chen',
    guardianB: 'Wei Chen',
    nokName: 'Li Chen',
    nokPhone: '+44 7700 900206',
    status: 'active',
    memberIds: ['demo-member-amy', 'demo-member-ben'],
    lastContact: '2026-09-17',
    balanceCents: 0,
    consentLabels: ['Photography', 'SMS reminders'],
    activity: [
      { id: 'li-1', title: 'Attendance streak', detail: 'Both members attended this week', date: '2026-09-17', tone: 'success' },
      { id: 'li-2', title: 'Coach message received', detail: 'Equipment question for Amy', date: '2026-09-13', tone: 'info' },
    ],
  },
  {
    id: 'demo-customer-emma',
    name: 'Emma Davies',
    phone: '+44 7700 900207',
    email: 'emma.davies@example.com',
    guardianA: 'Emma Davies',
    guardianB: null,
    nokName: 'Emma Davies',
    nokPhone: '+44 7700 900207',
    status: 'inactive',
    memberIds: ['demo-member-luca'],
    lastContact: '2026-08-28',
    balanceCents: 0,
    consentLabels: ['Email updates'],
    activity: [
      { id: 'emma-1', title: 'Membership paused', detail: 'Paused until 30 September', date: '2026-08-28', tone: 'warning' },
    ],
  },
];

const memberSeed: DemoMember[] = [
  {
    id: 'demo-member-ava',
    name: 'Ava Mitchell',
    dateOfBirth: '2012-11-03',
    memberCode: 'KF-1042',
    customerId: 'demo-customer-sarah',
    customerName: 'Sarah Mitchell',
    status: 'active',
    attendancePct: 90,
    sessionsAttended: 9,
    sessionsTotal: 10,
    lastAttended: '2026-09-16',
    nextSession: '2026-09-23T17:30:00',
    groups: ['Junior development', 'Friday squad'],
    handedness: 'R',
    playingStyle: 'Attacker',
    equipmentNotes: 'Uses a medium-hard forehand rubber. Bring spare grip tape.',
    specialNeedsFlag: false,
    createdAt: '2025-08-26',
    attendance: [
      { id: 'ava-a1', date: '2026-09-16', session: 'Junior development', venue: 'Woodley Club', coach: 'Jack', status: 'present' },
      { id: 'ava-a2', date: '2026-09-09', session: 'Junior development', venue: 'Woodley Club', coach: 'Jack', status: 'present' },
      { id: 'ava-a3', date: '2026-09-02', session: 'Friday squad', venue: 'Reading School', coach: 'Marcel', status: 'late' },
      { id: 'ava-a4', date: '2026-08-26', session: 'Junior development', venue: 'Woodley Club', coach: 'Jack', status: 'present' },
    ],
    goals: [
      { id: 'ava-g1', description: 'Land 7 of 10 backhand blocks under pressure', status: 'inProgress', targetDate: '2026-10-02', type: 'free' },
      { id: 'ava-g2', description: 'Enter the autumn junior singles', status: 'achieved', targetDate: '2026-09-12', type: 'competition' },
    ],
    matches: [
      { id: 'ava-m1', date: '2026-09-12', opponent: 'Mia Patel', result: 'W', event: 'Autumn junior singles' },
      { id: 'ava-m2', date: '2026-09-12', opponent: 'Sofia Jones', result: 'L', event: 'Autumn junior singles' },
      { id: 'ava-m3', date: '2026-08-30', opponent: 'Lily Grant', result: 'W', event: 'Club ladder' },
    ],
    feedback: [
      { id: 'ava-f1', date: '2026-09-16', body: 'Great adjustment on the receive today. Next step is holding the same shape when the pace increases.', coach: 'Jack' },
      { id: 'ava-f2', date: '2026-09-02', body: 'Strong movement into the forehand. Keep the first step smaller.', coach: 'Marcel' },
    ],
    timeline: [
      { id: 'ava-t1', title: 'Attended Junior development', detail: 'Present · Woodley Club · Coach Jack', date: '2026-09-16', tone: 'success' },
      { id: 'ava-t2', title: 'Coach feedback added', detail: 'Receive adjustment and next step', date: '2026-09-16', tone: 'brand' },
      { id: 'ava-t3', title: 'Entered autumn junior singles', detail: 'Guardian confirmation recorded', date: '2026-09-08', tone: 'info' },
    ],
  },
  {
    id: 'demo-member-oliver',
    name: 'Oliver Mitchell',
    dateOfBirth: '2016-04-18',
    memberCode: 'KF-1188',
    customerId: 'demo-customer-sarah',
    customerName: 'Sarah Mitchell',
    status: 'active',
    attendancePct: 80,
    sessionsAttended: 8,
    sessionsTotal: 10,
    lastAttended: '2026-09-16',
    nextSession: '2026-09-23T16:15:00',
    groups: ['Foundation juniors'],
    handedness: 'R',
    playingStyle: 'All-round',
    equipmentNotes: 'Junior bat; check grip size at next review.',
    specialNeedsFlag: false,
    createdAt: '2025-09-04',
    attendance: [
      { id: 'oli-a1', date: '2026-09-16', session: 'Foundation juniors', venue: 'Woodley Club', coach: 'Jack', status: 'present' },
      { id: 'oli-a2', date: '2026-09-09', session: 'Foundation juniors', venue: 'Woodley Club', coach: 'Jack', status: 'present' },
      { id: 'oli-a3', date: '2026-09-02', session: 'Foundation juniors', venue: 'Woodley Club', coach: 'Jack', status: 'absent' },
    ],
    goals: [{ id: 'oli-g1', description: 'Use a ready position before every serve receive', status: 'inProgress', targetDate: '2026-09-30', type: 'free' }],
    matches: [],
    feedback: [{ id: 'oli-f1', date: '2026-09-16', body: 'Lovely focus today. The ready position is becoming automatic.', coach: 'Jack' }],
    timeline: [{ id: 'oli-t1', title: 'Attended Foundation juniors', detail: 'Present · Woodley Club', date: '2026-09-16', tone: 'success' }],
  },
  {
    id: 'demo-member-noah',
    name: 'Noah Okafor',
    dateOfBirth: '2010-06-21',
    memberCode: 'KF-0931',
    customerId: 'demo-customer-daniel',
    customerName: 'Daniel Okafor',
    status: 'atRisk',
    attendancePct: 60,
    sessionsAttended: 6,
    sessionsTotal: 10,
    lastAttended: '2026-09-02',
    nextSession: '2026-09-22T18:00:00',
    groups: ['Performance group'],
    handedness: 'L',
    playingStyle: 'Counter-attacker',
    equipmentNotes: 'Prefers a slightly softer backhand rubber.',
    specialNeedsFlag: true,
    createdAt: '2024-11-10',
    alert: 'Follow up after two missed sessions',
    attendance: [
      { id: 'noa-a1', date: '2026-09-09', session: 'Performance group', venue: 'Reading School', coach: 'Raj', status: 'absent' },
      { id: 'noa-a2', date: '2026-09-02', session: 'Performance group', venue: 'Reading School', coach: 'Raj', status: 'present' },
      { id: 'noa-a3', date: '2026-08-26', session: 'Performance group', venue: 'Reading School', coach: 'Raj', status: 'absent' },
    ],
    goals: [
      { id: 'noa-g1', description: 'Rebuild a consistent first three balls routine', status: 'inProgress', targetDate: '2026-10-15', type: 'free' },
      { id: 'noa-g2', description: 'Reach top 20 in county ranking', status: 'missed', targetDate: '2026-08-31', type: 'rank' },
    ],
    matches: [{ id: 'noa-m1', date: '2026-08-24', opponent: 'Ethan Hall', result: 'L', event: 'County U17 league' }],
    feedback: [{ id: 'noa-f1', date: '2026-09-02', body: 'Good quality when settled. Let’s use the next session to simplify the serve plan.', coach: 'Raj' }],
    timeline: [
      { id: 'noa-t1', title: 'Attendance follow-up created', detail: 'Two missed sessions · assigned to Raj', date: '2026-09-10', tone: 'warning' },
      { id: 'noa-t2', title: 'Absent from Performance group', detail: 'No register note supplied', date: '2026-09-09', tone: 'danger' },
    ],
  },
  {
    id: 'demo-member-maya',
    name: 'Maya Shah',
    dateOfBirth: '2013-02-14',
    memberCode: 'KF-1116',
    customerId: 'demo-customer-priya',
    customerName: 'Priya Shah',
    status: 'active',
    attendancePct: 100,
    sessionsAttended: 10,
    sessionsTotal: 10,
    lastAttended: '2026-09-17',
    nextSession: '2026-09-24T17:00:00',
    groups: ['Junior development'],
    handedness: 'R',
    playingStyle: 'All-round',
    equipmentNotes: 'No equipment notes.',
    specialNeedsFlag: false,
    createdAt: '2025-01-18',
    attendance: [
      { id: 'maya-a1', date: '2026-09-17', session: 'Junior development', venue: 'Woodley Club', coach: 'Sam', status: 'present' },
      { id: 'maya-a2', date: '2026-09-10', session: 'Junior development', venue: 'Woodley Club', coach: 'Sam', status: 'present' },
      { id: 'maya-a3', date: '2026-09-03', session: 'Junior development', venue: 'Woodley Club', coach: 'Sam', status: 'present' },
    ],
    goals: [{ id: 'maya-g1', description: 'Play in the autumn junior singles', status: 'achieved', targetDate: '2026-09-14', type: 'competition' }],
    matches: [{ id: 'maya-m1', date: '2026-09-14', opponent: 'Ava Mitchell', result: 'W', event: 'Autumn junior singles' }],
    feedback: [{ id: 'maya-f1', date: '2026-09-17', body: 'Serve routine is much more reliable. Great work staying patient in the rally.', coach: 'Sam' }],
    timeline: [{ id: 'maya-t1', title: 'Goal achieved', detail: 'Entered the autumn junior singles', date: '2026-09-14', tone: 'success' }],
  },
  {
    id: 'demo-member-tom',
    name: 'Tom Wilson',
    dateOfBirth: '1998-09-28',
    memberCode: 'KF-0744',
    customerId: 'demo-customer-tom',
    customerName: 'Tom Wilson',
    status: 'active',
    attendancePct: 88,
    sessionsAttended: 7,
    sessionsTotal: 8,
    lastAttended: '2026-09-11',
    nextSession: '2026-09-24T19:00:00',
    groups: ['Adult 1-to-1'],
    handedness: 'R',
    playingStyle: 'Attacker',
    equipmentNotes: 'Interested in trying a faster blade at next equipment review.',
    specialNeedsFlag: false,
    createdAt: '2023-06-02',
    attendance: [
      { id: 'tom-a1', date: '2026-09-11', session: 'Adult 1-to-1', venue: 'Woodley Club', coach: 'Alex', status: 'present' },
      { id: 'tom-a2', date: '2026-09-04', session: 'Adult 1-to-1', venue: 'Woodley Club', coach: 'Alex', status: 'present' },
    ],
    goals: [{ id: 'tom-g1', description: 'Improve first-ball attack from backhand corner', status: 'inProgress', targetDate: '2026-10-20', type: 'free' }],
    matches: [{ id: 'tom-m1', date: '2026-09-06', opponent: 'Chris Moore', result: 'W', event: 'Club ladder' }],
    feedback: [{ id: 'tom-f1', date: '2026-09-11', body: 'Good session. We found a simpler receive pattern to repeat in matches.', coach: 'Alex' }],
    timeline: [{ id: 'tom-t1', title: '1-to-1 completed', detail: 'Serve receive and first-ball attack', date: '2026-09-11', tone: 'brand' }],
  },
  {
    id: 'demo-member-amy',
    name: 'Amy Chen',
    dateOfBirth: '2015-03-12',
    memberCode: 'KF-1210',
    customerId: 'demo-customer-li',
    customerName: 'Li Chen',
    status: 'active',
    attendancePct: 92,
    sessionsAttended: 11,
    sessionsTotal: 12,
    lastAttended: '2026-09-17',
    nextSession: '2026-09-24T16:00:00',
    groups: ['Foundation juniors'],
    handedness: 'R',
    playingStyle: 'Attacker',
    equipmentNotes: 'Junior bat; family asked for beginner equipment guide.',
    specialNeedsFlag: false,
    createdAt: '2025-10-01',
    attendance: [{ id: 'amy-a1', date: '2026-09-17', session: 'Foundation juniors', venue: 'Reading School', coach: 'Liam', status: 'present' }],
    goals: [{ id: 'amy-g1', description: 'Keep a 10-ball rally with a partner', status: 'inProgress', targetDate: '2026-10-08', type: 'free' }],
    matches: [],
    feedback: [{ id: 'amy-f1', date: '2026-09-17', body: 'Excellent energy and a really positive attitude to trying new serves.', coach: 'Liam' }],
    timeline: [{ id: 'amy-t1', title: 'Attended Foundation juniors', detail: 'Present · Reading School', date: '2026-09-17', tone: 'success' }],
  },
  {
    id: 'demo-member-ben',
    name: 'Ben Chen',
    dateOfBirth: '2014-07-22',
    memberCode: 'KF-1211',
    customerId: 'demo-customer-li',
    customerName: 'Li Chen',
    status: 'active',
    attendancePct: 83,
    sessionsAttended: 10,
    sessionsTotal: 12,
    lastAttended: '2026-09-17',
    nextSession: '2026-09-24T16:00:00',
    groups: ['Foundation juniors'],
    handedness: 'L',
    playingStyle: 'All-round',
    equipmentNotes: 'TTE number pending.',
    specialNeedsFlag: false,
    createdAt: '2025-10-01',
    attendance: [{ id: 'ben-a1', date: '2026-09-17', session: 'Foundation juniors', venue: 'Reading School', coach: 'Liam', status: 'present' }],
    goals: [{ id: 'ben-g1', description: 'Build confidence opening with the forehand', status: 'inProgress', targetDate: '2026-10-08', type: 'free' }],
    matches: [],
    feedback: [{ id: 'ben-f1', date: '2026-09-17', body: 'Good rally tolerance. We will add more purposeful placement next week.', coach: 'Liam' }],
    timeline: [{ id: 'ben-t1', title: 'Attended Foundation juniors', detail: 'Present · Reading School', date: '2026-09-17', tone: 'success' }],
  },
  {
    id: 'demo-member-luca',
    name: 'Luca Brown',
    dateOfBirth: '2011-10-30',
    memberCode: 'KF-0988',
    customerId: 'demo-customer-emma',
    customerName: 'Emma Davies',
    status: 'inactive',
    attendancePct: 55,
    sessionsAttended: 5,
    sessionsTotal: 9,
    lastAttended: '2026-08-27',
    nextSession: null,
    groups: ['Junior development'],
    handedness: 'R',
    playingStyle: 'All-round',
    equipmentNotes: null,
    specialNeedsFlag: false,
    createdAt: '2024-04-11',
    alert: 'Membership paused until 30 September',
    attendance: [{ id: 'luca-a1', date: '2026-08-27', session: 'Junior development', venue: 'Woodley Club', coach: 'Jack', status: 'present' }],
    goals: [],
    matches: [],
    feedback: [],
    timeline: [{ id: 'luca-t1', title: 'Membership paused', detail: 'Review on 30 September', date: '2026-08-28', tone: 'warning' }],
  },
];

export const DEMO_MEMBERS = memberSeed;
export const DEMO_CUSTOMERS = customerSeed;

/* Keep demo creates useful between navigations without ever touching Supabase. */
const LOCAL_PEOPLE_KEY = 'mentis.demoPeople.v1';
interface LocalPeople {
  customers: DemoCustomer[];
  members: DemoMember[];
}

function localPeople(): LocalPeople {
  if (typeof localStorage === 'undefined') return { customers: [], members: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_PEOPLE_KEY) ?? '{}');
    return {
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      members: Array.isArray(parsed.members) ? parsed.members : [],
    };
  } catch {
    return { customers: [], members: [] };
  }
}

function saveLocalPeople(value: LocalPeople) {
  try {
    localStorage.setItem(LOCAL_PEOPLE_KEY, JSON.stringify(value));
  } catch {
    /* Demo data is still usable for the current render if storage is blocked. */
  }
}

export function demoMembersSnapshot() {
  return [...DEMO_MEMBERS, ...localPeople().members];
}

export function demoCustomersSnapshot() {
  return [...DEMO_CUSTOMERS, ...localPeople().customers];
}

export function demoMemberById(id: string | undefined) {
  return demoMembersSnapshot().find((member) => member.id === id) ?? null;
}

export function demoCustomerById(id: string | undefined) {
  return demoCustomersSnapshot().find((customer) => customer.id === id) ?? null;
}

export function demoMembersForCustomer(customerId: string) {
  return demoMembersSnapshot().filter((member) => member.customerId === customerId);
}

export function addDemoCustomer(input: { name: string; phone?: string; email?: string; guardianA?: string; guardianB?: string; nokName?: string; nokPhone?: string }) {
  const now = new Date().toISOString();
  const customer: DemoCustomer = {
    id: `demo-customer-local-${Date.now()}`,
    name: input.name,
    phone: input.phone ?? '',
    email: input.email ?? '',
    guardianA: input.guardianA || null,
    guardianB: input.guardianB || null,
    nokName: input.nokName || null,
    nokPhone: input.nokPhone || null,
    status: 'active',
    memberIds: [],
    lastContact: now,
    balanceCents: 0,
    consentLabels: [],
    activity: [{ id: `customer-created-${Date.now()}`, title: 'Customer created', detail: 'Added from the people workspace', date: now, tone: 'brand' }],
  };
  const stored = localPeople();
  stored.customers.push(customer);
  saveLocalPeople(stored);
  return customer;
}

export function addDemoMember(input: { name: string; dateOfBirth: string; customerId?: string; tteNumber?: string; handedness?: 'L' | 'R'; playingStyle?: string; equipmentNotes?: string }) {
  const now = new Date().toISOString();
  const customer = input.customerId ? demoCustomerById(input.customerId) : null;
  const member: DemoMember = {
    id: `demo-member-local-${Date.now()}`,
    name: input.name,
    dateOfBirth: input.dateOfBirth,
    memberCode: input.tteNumber || `KF-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    customerId: input.customerId || null,
    customerName: customer?.name ?? null,
    status: 'active',
    attendancePct: 0,
    sessionsAttended: 0,
    sessionsTotal: 0,
    lastAttended: null,
    nextSession: null,
    groups: [],
    handedness: input.handedness ?? null,
    playingStyle: input.playingStyle || null,
    equipmentNotes: input.equipmentNotes || null,
    specialNeedsFlag: false,
    createdAt: now,
    attendance: [],
    goals: [],
    matches: [],
    feedback: [],
    timeline: [{ id: `member-created-${Date.now()}`, title: 'Member created', detail: 'Added from the people workspace', date: now, tone: 'brand' }],
  };
  const stored = localPeople();
  stored.members.push(member);
  saveLocalPeople(stored);
  return member;
}
