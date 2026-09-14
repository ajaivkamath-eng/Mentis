import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { Protected, Shell } from './lib/ui';
import { Login, Dashboard, SearchPage, Users, Settings, Reports } from './pages/admin';
import { Today, Register, Feedback } from './pages/coaching';
import { Members, Member360, Customers, Tasters } from './pages/entities';
import { Sessions, StaffingDiary, Scheduling, Tasks, Inbox } from './pages/ops';
import { Billing, Timesheet, Charges } from './pages/billing';
import { Events } from './pages/comp';
import { PublicTaster, PublicDiary, Microflow, Booking12 } from './pages/public';
import type { ReactElement } from 'react';

const P = (perm: any, el: ReactElement) => <Protected perm={perm}><Shell>{el}</Shell></Protected>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
          <Route path="/members/:id" element={P('customers.view', <Member360 />)} />
          <Route path="/customers" element={P('customers.view', <Customers />)} />
          <Route path="/tasters" element={P('tasters.manage', <Tasters />)} />
          <Route path="/sessions" element={P('sessions.manage', <Sessions />)} />
          <Route path="/scheduling" element={P('sessions.manage', <Scheduling />)} />
          <Route path="/diary-manage" element={P('diary.manage', <StaffingDiary />)} />
          <Route path="/tasks" element={P('tasks.viewOwn', <Tasks />)} />
          <Route path="/inbox" element={P('actions.closeOwn', <Inbox />)} />
          <Route path="/billing" element={P('billing.viewOwn', <Billing />)} />
          <Route path="/timesheet" element={P('timesheet.self', <Timesheet />)} />
          <Route path="/charges" element={P('charges.viewOwn', <Charges />)} />
          <Route path="/events" element={P('events.viewOwn', <Events />)} />
          <Route path="/search" element={P(undefined, <SearchPage />)} />
          <Route path="/users" element={P('users.manage', <Users />)} />
          <Route path="/settings" element={P('org.manage', <Settings />)} />
          <Route path="/reports" element={P('billing.viewAll', <Reports />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
