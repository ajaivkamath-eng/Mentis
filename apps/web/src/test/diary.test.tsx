/**
 * Calendar-first coach diary — component tests.
 *
 * Runs against the seeded demo store (design-review mode), so the assertions
 * exercise the real page: toolbar, week grid with system bookings + conflicts,
 * month/agenda views, the details popover, and the Regular Availability
 * Planner with its generated-entry preview.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../lib/theme';
import { Availability } from '../pages/availability';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    userId: 'user-1',
    staff: {
      id: 'demo-staff-0000',
      organization_id: 'demo-org-0000',
      user_id: 'user-1',
      display_name: 'Alex Morgan',
      roles: ['SUPER_ADMIN', 'COACH'],
    },
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN', 'COACH'],
    loading: false,
    setRole: vi.fn(),
    canDo: () => true,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => { throw new Error('demo mode must not query supabase'); }, auth: { signOut: async () => {} } },
  functionsUrl: (name: string) => `/functions/v1/${name}`,
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Availability />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('coach diary calendar', () => {
  it('renders the Outlook-style week grid with bookings, availability and conflicts', async () => {
    renderPage();

    // Toolbar basics
    expect(screen.getByRole('tab', { name: 'week', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();

    // Demo dataset: system session allocations and planner-generated availability
    await waitFor(() => {
      expect(screen.getAllByText('U11 Juniors').length).toBeGreaterThan(0);
    });
    // Regular availability generated from the planner pattern
    expect(screen.getAllByText('Regular availability').length).toBeGreaterThan(0);

    // Conflict strip: holiday vs next week is out of view this week, but Priya's
    // sick leave vs tonight's Beginners session is in range.
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /availability conflicts/i })).toHaveTextContent('upcoming availability conflicts');
    });
    expect(screen.getAllByText(/overlaps this period by 60 minutes/).length).toBeGreaterThan(0);

    // Legend covers the colour-coded kinds
    expect(screen.getByText('Holiday / annual leave')).toBeInTheDocument();
    expect(screen.getByText('Booked session')).toBeInTheDocument();
  });

  it('shows entry details with source + editability on click', async () => {
    const user = userEvent.setup();
    renderPage();
    const chips = await screen.findAllByText('U11 Juniors');
    const block = chips.map((el) => el.closest('[data-event-id]')).find(Boolean) as HTMLElement;
    await user.click(block);

    const dialog = await screen.findByRole('dialog', { name: 'Entry details' });
    expect(within(dialog).getByText('Session booking · system')).toBeInTheDocument();
    expect(within(dialog).getByText('Read-only in diary')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /open/i })).toBeInTheDocument();
  });

  it('opens the compact side panel (not a large modal form) for new entries', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /new entry/i }));
    const panel = await screen.findByRole('complementary', { name: 'Create diary entry' });
    expect(within(panel).getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(within(panel).getByText('Available for coaching')).toBeInTheDocument();
    expect(within(panel).getByText('Holiday / annual leave')).toBeInTheDocument();
    // Recurrence + visibility + delete/cancel affordances
    expect(within(panel).getByText('Repeat weekly until')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('switches to month and agenda views', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'month' }));
    // month grid shows weekday headers
    expect(screen.getAllByText('Mon').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'agenda' }));
    // agenda lists day groups with entry counts
    await waitFor(() => {
      expect(screen.getAllByText(/entr/).length).toBeGreaterThan(0);
    });
  });

  it('compares multiple coaches side by side', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /coach(es)? compared|Alex Morgan/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose coaches' });
    await user.click(within(dialog).getByText('Priya Sharma'));
    // header initials lanes appear (AM + PS)
    await waitFor(() => {
      expect(screen.getAllByText('PS').length).toBeGreaterThan(0);
    });
  });

  it('admins get the resource timeline (coaches as rows)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'Staff' }));
    expect(screen.getByText('Coach / day')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
  });

  it('planner previews generated entries before applying', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: /planner/i }));

    const planner = await screen.findByRole('complementary', { name: 'Regular availability planner' });
    expect(within(planner).getAllByText('Not available').length).toBeGreaterThanOrEqual(2); // Sat + Sun default
    expect(within(planner).getByText(/availability blocks/i)).toBeInTheDocument();

    // Empty patterns cannot be applied…
    expect(within(planner).getByRole('button', { name: /apply pattern to calendar/i })).toBeDisabled();

    // …but loading an existing pattern populates the windows and enables apply.
    await user.click(within(planner).getByRole('button', { name: /load/i }));
    expect(await within(planner).findByDisplayValue('12:00')).toBeInTheDocument();
    expect(within(planner).getByRole('button', { name: /apply pattern to calendar/i })).toBeEnabled();
  });

  it('opens planner-generated occurrences for individual editing (§6)', async () => {
    const user = userEvent.setup();
    renderPage();
    const blocks = await screen.findAllByText('Regular availability');
    const block = blocks.map((el) => el.closest('[data-event-id]')).find(Boolean) as HTMLElement;
    await user.dblClick(block);
    const panel = await screen.findByRole('complementary', { name: 'Edit diary entry' });
    // The occurrence is editable — saving writes an exception, not the pattern.
    expect(within(panel).getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('exposes settings, filters and shortcut affordances', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('button', { name: /shortcuts/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /filters/i }));
    const dialog = await screen.findByRole('dialog', { name: 'View filters' });
    expect(within(dialog).getByText('Sessions & tasks')).toBeInTheDocument();
  });
});
