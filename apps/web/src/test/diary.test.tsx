import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../lib/theme';
import { Availability } from '../pages/availability';
import { DiaryCalendar, buildQuickAvailabilityRow, buildVenueOptions, getTimeMinutesFromIso, normalizeDiaryDateValue, resolveAvailabilityEntryType } from '../pages/diarycal';

const fixtures = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  filters: [] as Array<{ table: string; operator: string; column: string; value: string }>,
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    staff: { id: 'coach-1', user_id: 'user-1', organization_id: 'org-1', display_name: 'Alex Morgan' },
    canDo: () => true,
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        insert: (row: Record<string, unknown>) => {
          fixtures.tables[table] = [...(fixtures.tables[table] ?? []), { id: 'created-vacation', ...row, mentis_staff: { display_name: 'Alex Morgan' } }];
          return Promise.resolve({ error: null });
        },
        update: (changes: Record<string, unknown>) => ({ eq: (_column: string, id: string) => {
          fixtures.tables[table] = (fixtures.tables[table] ?? []).map(row => (row as { id: string }).id === id ? { ...row as object, ...changes } : row);
          return Promise.resolve({ error: null });
        } }),
        delete: () => ({ eq: (_column: string, id: string) => {
          fixtures.tables[table] = (fixtures.tables[table] ?? []).filter(row => (row as { id: string }).id !== id);
          return Promise.resolve({ error: null });
        } }),
        order: () => query,
        limit: () => query,
        gte: (column: string, value: string) => { fixtures.filters.push({ table, operator: 'gte', column, value }); return query; },
        lte: () => query,
        lt: (column: string, value: string) => { fixtures.filters.push({ table, operator: 'lt', column, value }); return query; },
        gt: (column: string, value: string) => { fixtures.filters.push({ table, operator: 'gt', column, value }); return query; },
        eq: () => query,
        then: (resolve: (result: { data: unknown[]; error: null }) => void) =>
          Promise.resolve({ data: fixtures.tables[table] ?? [], error: null }).then(resolve),
      };
      return query;
    },
  },
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

function renderCalendar() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <DiaryCalendar />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  fixtures.filters = [];
  fixtures.tables = {
    mentis_staff: [
      { id: 'coach-1', display_name: 'Alex Morgan' },
      { id: 'coach-2', display_name: 'Priya Sharma' },
    ],
  };
});

describe('coach availability diary', () => {
  it('requires an authenticated staff user before writing a diary row', () => {
    expect(() => buildQuickAvailabilityRow({
      staff_id: 'coach-1',
      organization_id: 'org-1',
      starts_at: '2026-01-01T09:00:00.000Z',
      ends_at: '2026-01-01T10:00:00.000Z',
      available: false,
      availability_type: 'unavailable_other',
      reason: 'Leave',
    }, null)).toThrow('linked to a staff profile');

    expect(buildQuickAvailabilityRow({
      staff_id: 'coach-1',
      organization_id: 'org-1',
      starts_at: '2026-01-01T09:00:00.000Z',
      ends_at: '2026-01-01T10:00:00.000Z',
      available: false,
      availability_type: 'vacation',
      reason: 'Vacation',
    }, 'user-123')).toMatchObject({
      recorded_by: 'user-123',
      created_by: 'user-123',
      staff_id: 'coach-1',
      availability_type: 'vacation',
    });
  });

  it('keeps venue filters visible even when the selected month has no session rows', () => {
    expect(buildVenueOptions([], [
      { id: 'venue-1', name: 'South End' },
      { id: 'venue-2', name: 'North Court' },
    ])).toEqual([
      { id: 'venue-2', name: 'North Court' },
      { id: 'venue-1', name: 'South End' },
    ]);

    expect(buildVenueOptions([
      { mentis_venues: { id: 'venue-3', name: 'Kingsway Hall' } },
    ], [
      { id: 'venue-1', name: 'South End' },
    ])).toEqual([
      { id: 'venue-3', name: 'Kingsway Hall' },
      { id: 'venue-1', name: 'South End' },
    ]);
  });

  it('loads the weekly calendar and shows empty diary states', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Coach Personal Diary & Availability Planner' })).toBeInTheDocument();
    expect(screen.getByText('Weekly working hours calendar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next week' })).toBeInTheDocument();
    expect(await screen.findByText('No diary entries recorded for this selection.')).toBeInTheDocument();
    expect(screen.getByText('No allocated sessions found for this selection.')).toBeInTheDocument();
  });

  it('changes weeks without discarding the week grid', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument();
    expect(screen.getByText('Weekly working hours calendar')).toBeInTheDocument();
    expect(screen.getAllByText('Mon').length).toBeGreaterThan(0);
  });

  it('maps availability rows to the exact calendar item types used by the diary filters', () => {
    expect(resolveAvailabilityEntryType({ available: false, availability_type: 'vacation' })).toBe('vacation');
    expect(resolveAvailabilityEntryType({ available: false, availability_type: 'unavailable_other' })).toBe('leave');
    expect(resolveAvailabilityEntryType({ available: true, availability_type: 'available' })).toBe('other');
  });

  it('normalizes database timestamps that use a space separator before date math', () => {
    expect(normalizeDiaryDateValue('2026-09-28 09:00:00+00')).toBe('2026-09-28T09:00:00+00:00');
    expect(normalizeDiaryDateValue('2026-09-28')).toBe('2026-09-28');
    expect(Number.isFinite(getTimeMinutesFromIso('2026-09-28 09:00:00+00'))).toBe(true);
  });

  it('shows calendar holidays, league events and staff availability in day and week', async () => {
    const user = userEvent.setup();
    fixtures.tables.mentis_holiday_calendar = [
      { id: 'bank-1', name: 'Bank holiday', kind: 'bank_holiday', starts_on: '2026-09-28', ends_on: '2026-09-28' },
      { id: 'term-1', name: 'Term break', kind: 'term_break', starts_on: '2026-09-29', ends_on: '2026-09-29' },
    ];
    fixtures.tables.mentis_events = [{ id: 'league-1', name: 'Autumn league', starts_on: '2026-09-27', ends_on: '2026-09-29', location: 'Kingfisher' }];
    fixtures.tables.mentis_staff_availability = [
      { id: 'staff-1', staff_id: 'coach-1', available: true, availability_type: 'available', reason: 'Open hours', starts_at: '2026-09-28T09:00:00Z', ends_at: '2026-09-28T10:00:00Z', mentis_staff: { display_name: 'Alex Morgan' } },
      { id: 'legacy-1', staff_id: 'coach-1', available: false, availability_type: 'vacation', reason: 'Annual leave', starts_at: '2026-09-28T11:00:00Z', ends_at: '2026-09-28T12:00:00Z', mentis_staff: { display_name: 'Alex Morgan' } },
    ];
    renderCalendar();
    fireEvent.change(screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/), { target: { value: '2026-09-28' } });
    await waitFor(() => expect(screen.queryByText('Loading diary schedule and coach availability…')).not.toBeInTheDocument());
    expect(screen.getByLabelText('All-day entries for 2026-09-28')).toHaveTextContent('Autumn league');
    expect(screen.getByLabelText('All-day entries for 2026-09-29')).toHaveTextContent('Autumn league');
    expect(fixtures.filters).toContainEqual({ table: 'mentis_events', operator: 'gte', column: 'ends_on', value: '2026-08-26' });
    expect(screen.getByText('Bank holiday')).toBeInTheDocument();
    expect(screen.getByLabelText('All-day entries for 2026-09-29')).toHaveTextContent('Term break');
    expect(screen.getByText('Open hours')).toBeInTheDocument();
    expect(screen.getByText('Annual leave')).toBeInTheDocument();
    expect(resolveAvailabilityEntryType({ available: false, availability_type: 'vacation' })).toBe('vacation');
    await user.click(screen.getByRole('button', { name: /^day$/i }));
    expect(screen.getByText('Autumn league')).toBeInTheDocument();
    expect(screen.getByText('Bank holiday')).toBeInTheDocument();
    expect(screen.getByText('Open hours')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(screen.queryByRole('button', { name: /^holiday$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Holiday \/ Leave/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vacation' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Vacation' })[1]);
    expect((screen.getByRole('option', { name: 'Vacation' }) as HTMLOptionElement).parentElement).toHaveValue('vacation');
  });

  it('shows saved vacation and leave in day, week and month calendar views', async () => {
    const user = userEvent.setup();
    fixtures.tables.mentis_staff_availability = [
      { id: 'holiday-1', staff_id: 'coach-1', available: false, availability_type: 'vacation', reason: 'Vacation', starts_at: '2026-09-28 09:00:00+00', ends_at: '2026-09-28 10:00:00+00', mentis_staff: { display_name: 'Alex Morgan' } },
      { id: 'leave-1', staff_id: 'coach-1', available: false, availability_type: 'unavailable_other', reason: 'Leave', starts_at: '2026-09-28 10:30:00+00', ends_at: '2026-09-28 11:30:00+00', mentis_staff: { display_name: 'Alex Morgan' } },
      { id: 'holiday-2', staff_id: 'coach-1', available: false, availability_type: 'vacation', reason: 'Vacation', starts_at: '2026-09-28 10:45:00+00', ends_at: '2026-09-28 11:45:00+00', mentis_staff: { display_name: 'Alex Morgan' } },
      { id: 'leave-2', staff_id: 'coach-1', available: false, availability_type: 'unavailable_other', reason: 'Leave', starts_at: '2026-09-28 12:30:00+00', ends_at: '2026-09-28 13:30:00+00', mentis_staff: { display_name: 'Alex Morgan' } },
    ];
    renderCalendar();
    fireEvent.change(screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/), { target: { value: '2026-09-28' } });
    await waitFor(() => expect(screen.queryByText('Loading diary schedule and coach availability…')).not.toBeInTheDocument());

    expect(fixtures.filters).toContainEqual({ table: 'mentis_staff_availability', operator: 'lt', column: 'starts_at', value: '2026-10-08T00:00:00.000Z' });
    expect(screen.getAllByTitle(/^Vacation · Coach:/)).toHaveLength(2);
    expect(screen.getAllByTitle(/^Leave · Coach:/)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /^day$/i }));
    expect(screen.getAllByTitle(/^Vacation · Coach:/)).toHaveLength(2);
    expect(screen.getAllByTitle(/^Leave · Coach:/)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /^month$/i }));
    expect(screen.queryAllByTitle(/Vacation/).map(element => element.getAttribute('title'))).toContain('Vacation · Vacation · Alex Morgan');
    await user.click(screen.getByRole('button', { name: '+2 more' }));
    expect(screen.getAllByTitle(/^Vacation · Coach:/)).toHaveLength(2);
    expect(screen.getAllByTitle(/^Leave · Coach:/)).toHaveLength(2);
  });

  it('groups list entries across the selected week and filters by search, venue and type', async () => {
    const user = userEvent.setup();
    fixtures.tables.mentis_staff_availability = [
      { id: 'jack-holiday', staff_id: 'coach-1', available: false, availability_type: 'vacation', reason: 'Jack holiday', starts_at: '2026-09-28T09:00:00Z', ends_at: '2026-09-28T10:00:00Z', mentis_staff: { display_name: 'Alex Morgan' } },
      { id: 'jack-available', staff_id: 'coach-1', available: true, availability_type: 'available', reason: 'Open hours', starts_at: '2026-09-28T11:00:00Z', ends_at: '2026-09-28T12:00:00Z', mentis_staff: { display_name: 'Alex Morgan' } },
    ];
    fixtures.tables.mentis_session_occurrences = [
      { id: 'session-1', name: 'Friday coaching', start_at: '2026-10-02T16:00:00Z', end_at: '2026-10-02T17:30:00Z', venue_id: 'venue-1', mentis_venues: { id: 'venue-1', name: 'Kingfisher' }, responsible_coach: { id: 'coach-2', display_name: 'Priya Sharma' } },
    ];
    fixtures.tables.mentis_venues = [{ id: 'venue-1', name: 'Kingfisher' }];
    renderCalendar();
    fireEvent.change(screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/), { target: { value: '2026-09-30' } });
    await user.click(screen.getByRole('button', { name: /^list$/i }));
    expect(await screen.findByText('Jack holiday')).toBeInTheDocument();
    expect(screen.getByText('Open hours')).toBeInTheDocument();
    expect(screen.getByText('Friday coaching')).toBeInTheDocument();
    expect(screen.getAllByText('No scheduled sessions for this date.').length).toBeGreaterThan(0);
    await user.type(screen.getByRole('searchbox', { name: /search diary/i }), 'Priya');
    expect(screen.queryByText('Jack holiday')).not.toBeInTheDocument();
    expect(screen.getByText('Friday coaching')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: /search diary/i }));
    await user.click(screen.getByRole('button', { name: 'Kingfisher' }));
    expect(screen.queryByText('Jack holiday')).not.toBeInTheDocument();
    expect(screen.getByText('Friday coaching')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(screen.getByRole('button', { name: 'Vacation' }));
    expect(screen.queryByText('Jack holiday')).not.toBeInTheDocument();
    expect(screen.getByText('Friday coaching')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vacation' }));
    const group = screen.getByRole('button', { name: /Monday, 28 Sept 2026/i });
    await user.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Jack holiday')).not.toBeInTheDocument();
    await user.click(group);
    expect(screen.getByText('Jack holiday')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /^add entry$/i })[1]);
    expect(screen.getAllByDisplayValue(/^2026-09-28T/)).toHaveLength(2);
  });

  it('edits and deletes a saved availability row from the list', async () => {
    const user = userEvent.setup();
    fixtures.tables.mentis_staff_availability = [
      { id: 'entry-1', organization_id: 'org-1', staff_id: 'coach-1', available: false, availability_type: 'vacation', reason: 'Jack holiday', starts_at: '2026-09-28T09:00:00Z', ends_at: '2026-09-28T10:00:00Z', mentis_staff: { display_name: 'Alex Morgan' }, created_by: 'original-author' },
    ];
    renderCalendar();
    fireEvent.change(screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/), { target: { value: '2026-09-28' } });
    await user.click(screen.getByRole('button', { name: /^list$/i }));
    await user.click(await screen.findByRole('button', { name: 'Edit Jack holiday' }));
    await user.clear(screen.getByPlaceholderText('Coach diary note'));
    await user.type(screen.getByPlaceholderText('Coach diary note'), 'Jack annual leave');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText('Jack annual leave')).toBeInTheDocument();
    expect((fixtures.tables.mentis_staff_availability[0] as { created_by: string }).created_by).toBe('original-author');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete Jack annual leave' }));
    await waitFor(() => expect(screen.queryByText('Jack annual leave')).not.toBeInTheDocument());
    confirm.mockRestore();
  });

  it('saves a vacation entry using the database enum and shows it in the diary', async () => {
    const user = userEvent.setup();
    renderCalendar();
    fireEvent.change(screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/), { target: { value: '2026-09-28' } });
    await user.click(screen.getByRole('button', { name: 'Add entry' }));
    await user.click(screen.getAllByRole('button', { name: 'Vacation' })[1]);
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(fixtures.tables.mentis_staff_availability).toHaveLength(1));
    expect(fixtures.tables.mentis_staff_availability[0]).toMatchObject({ available: false, availability_type: 'vacation', reason: 'Vacation' });
    expect(await screen.findByTitle(/^Vacation · Coach:/)).toBeInTheDocument();
  });

  it('opens and cancels a new diary appointment', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(screen.getByRole('heading', { name: 'Add availability window or leave' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vacation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save appointment' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Save appointment' })).not.toBeInTheDocument();
  });

  it('filters diary entries to the selected coach', async () => {
    const user = userEvent.setup();
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    fixtures.tables.mentis_staff_availability = [
      { id: 'entry-1', staff_id: 'coach-1', available: false, availability_type: 'vacation', reason: 'Alex leave', starts_at: start.toISOString(), ends_at: end.toISOString(), mentis_staff: { display_name: 'Alex Morgan' } },
      { id: 'entry-2', staff_id: 'coach-2', available: false, availability_type: 'vacation', reason: 'Priya leave', starts_at: start.toISOString(), ends_at: end.toISOString(), mentis_staff: { display_name: 'Priya Sharma' } },
    ];
    renderPage();

    await waitFor(() => expect(screen.getByText('"Alex leave"')).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'coach-1');
    expect(screen.getByText('"Alex leave"')).toBeInTheDocument();
    expect(screen.queryByText('"Priya leave"')).not.toBeInTheDocument();
  });
});