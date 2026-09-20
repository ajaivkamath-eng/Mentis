import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Protected, Shell } from './lib/ui';
import { Login, Dashboard, SearchPage, Users, Settings, Reports } from './pages/admin';
import { Today, Register, Feedback } from './pages/coaching';
import { Members, Member360, Customers, Customer360, Tasters } from './pages/entities';
import { Sessions, Scheduling, Tasks, Inbox } from './pages/ops';
import { SessionTemplates } from './pages/templates';
import { Billing, Timesheet, Charges, Reconciliation } from './pages/billing';
import { Events, MatchEntry, RankingEntry, Goals, Analytics } from './pages/comp';
import { PublicTaster, PublicDiary, Microflow, Booking12 } from './pages/public';
import { Venues, Groups, RateCards, Holidays, Overrides, ActionTimelines, Devices, AuditViewer } from './pages/manage';
import { Importer } from './pages/importer';
import { MemberForm, CustomerForm, Enrolments } from './pages/people';
import { Staffing, SessionClose } from './pages/staffing';
import { Availability } from './pages/availability';
import { ActionCreate } from './pages/actions';
import { DiaryCalendar } from './pages/diarycal';
import { BookingSlots, Bookings } from './pages/bookings';
import { ProgressReports, CoachPerformance, SparringMatcher, AutoSuggest } from './pages/growth';
import { VenueDashboard, MemberSessions, IcsExport } from './pages/dashboards';
import { DesignSystem } from './pages/design-system';
import { CommandPaletteProvider } from './components/patterns/command-palette';
import type { ReactElement } from 'react';

/** Guard + frame in one call: every authenticated route looks the same. */
const P = (perm: any, el: ReactElement) => (
  <Protected perm={perm}>
    <Shell>{el}</Shell>
  </Protected>
);

/** The ⌘K palette is only mounted for signed-in staff. */
function AuthedPalette({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  return <CommandPaletteProvider enabled={Boolean(userId)}>{children}</CommandPaletteProvider>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthedPalette>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/taster" element={<PublicTaster />} />
            <Route path="/diary" element={<PublicDiary />} />
            <Route path="/my" element={<Microflow />} />
            <Route path="/book" element={<Booking12 />} />
            <Route path="/" element={P(undefined, <Dashboard />)} />
            <Route path="/today" element={P('sessions.assigned', <Today />)} />
            <Route path="/register/:id" element={P('attendance.view', <Register />)} />
            <Route path="/feedback/:source/:id" element={P('events.manage', <Feedback />)} />
            <Route path="/members" element={P('customers.view', <Members />)} />
            <Route path="/members/new" element={P('customers.manage', <MemberForm />)} />
            <Route path="/members/:id" element={P('customers.view', <Member360 />)} />
            <Route path="/customers" element={P('customers.view', <Customers />)} />
            <Route path="/customers/new" element={P('customers.manage', <CustomerForm />)} />
            <Route path="/customers/:id" element={P('customers.view', <Customer360 />)} />
            <Route path="/enrolments" element={P('sessions.manage', <Enrolments />)} />
            <Route path="/tasters" element={P('tasters.manage', <Tasters />)} />
            <Route path="/sessions" element={P('sessions.manage', <Sessions />)} />
            <Route path="/scheduling" element={P('sessions.manage', <Scheduling />)} />
            <Route path="/templates" element={P('sessions.manage', <SessionTemplates />)} />
            <Route path="/overrides" element={P('sessions.manage', <Overrides />)} />
            <Route path="/holidays" element={P('sessions.manage', <Holidays />)} />
            <Route path="/diary-manage" element={P('diary.manage', <DiaryCalendar />)} />
            <Route path="/staffing" element={P('staffing.manage', <Staffing />)} />
            <Route path="/closeout" element={P('staffing.manage', <SessionClose />)} />
            <Route path="/availability" element={P('availability.recordSelf', <Availability />)} />
            <Route path="/tasks" element={P('tasks.viewOwn', <Tasks />)} />
            <Route path="/inbox" element={P('actions.closeOwn', <Inbox />)} />
            <Route path="/actions/new" element={P('actions.createManual', <ActionCreate />)} />
            <Route path="/action-timelines" element={P('tasks.approve', <ActionTimelines />)} />
            <Route path="/billing" element={P('billing.viewOwn', <Billing />)} />
            <Route path="/reconciliation" element={P('billing.viewAll', <Reconciliation />)} />
            <Route path="/timesheet" element={P('timesheet.self', <Timesheet />)} />
            <Route path="/charges" element={P('charges.viewOwn', <Charges />)} />
            <Route path="/rates" element={P('rates.manage', <RateCards />)} />
            <Route path="/events" element={P('events.viewOwn', <Events />)} />
            <Route path="/matches/new" element={P('events.manage', <MatchEntry />)} />
            <Route path="/rankings" element={P('events.manage', <RankingEntry />)} />
            <Route path="/goals" element={P('events.manage', <Goals />)} />
            <Route path="/analytics" element={P('events.viewOwn', <Analytics />)} />
            <Route path="/slots" element={P('events.manage', <BookingSlots />)} />
            <Route path="/bookings" element={P('events.manage', <Bookings />)} />
            <Route path="/progress" element={P('events.manage', <ProgressReports />)} />
            <Route path="/coach-perf" element={P('billing.viewOwn', <CoachPerformance />)} />
            <Route path="/sparring" element={P('events.manage', <SparringMatcher />)} />
            <Route path="/suggest" element={P('events.manage', <AutoSuggest />)} />
            <Route path="/venues" element={P('venues.manage', <Venues />)} />
            <Route path="/groups" element={P('groups.manage', <Groups />)} />
            <Route path="/devices" element={P('devices.revoke', <Devices />)} />
            <Route path="/audit" element={P('audit.view', <AuditViewer />)} />
            <Route path="/import" element={P('sessions.manage', <Importer />)} />
            <Route path="/venue-dashboard" element={P('billing.viewAll', <VenueDashboard />)} />
            <Route path="/member-sessions" element={P('billing.viewAll', <MemberSessions />)} />
            <Route path="/ics" element={P('timesheet.self', <IcsExport />)} />
            <Route path="/search" element={P(undefined, <SearchPage />)} />
            <Route path="/users" element={P('users.manage', <Users />)} />
            <Route path="/settings" element={P('org.manage', <Settings />)} />
            <Route path="/reports" element={P('billing.viewAll', <Reports />)} />
            {/* Living style guide — the design system is browsable, not a PDF. */}
            <Route path="/design-system" element={P(undefined, <DesignSystem />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthedPalette>
      </BrowserRouter>
    </AuthProvider>
  );
}
