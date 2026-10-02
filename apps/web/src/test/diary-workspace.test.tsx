import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { buildDemoDiary, DEMO_ME } from '../lib/diary/demo';
import { dateKey } from '../lib/diary/model';
import { DiaryWorkspace } from '../pages/diary';

const mocks = vi.hoisted(() => ({ diary: null as any }));

vi.mock('../lib/diary/store', () => ({
  useDiaryData: () => mocks.diary,
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    userId: 'demo-user',
    staff: { id: 'staff-demo-me', display_name: 'Alex Morgan', roles: ['SUPER_ADMIN'] },
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN'],
    loading: false,
    setRole: vi.fn(),
    canDo: () => true,
    signOut: vi.fn(),
  }),
}));

function renderDiary() {
  return render(<MemoryRouter><DiaryWorkspace /></MemoryRouter>);
}

beforeEach(() => {
  const seed = buildDemoDiary();
  mocks.diary = {
    state: {
      events: seed.events,
      rules: seed.rules,
      conflicts: seed.conflicts.map((conflict, index) => ({ ...conflict, id: `conflict-${index}`, status: 'open' })),
      staff: seed.staff,
      meId: DEMO_ME,
      loading: false,
      error: null,
      range: { from: '', to: '' },
    },
    isDemo: true,
    refresh: vi.fn().mockResolvedValue(undefined),
    loadRange: vi.fn().mockResolvedValue(undefined),
    createEntry: vi.fn().mockResolvedValue(null),
    updateEntry: vi.fn().mockResolvedValue(undefined),
    deleteEntries: vi.fn().mockResolvedValue(undefined),
    duplicateEntry: vi.fn().mockResolvedValue(null),
    saveRule: vi.fn().mockResolvedValue('saved'),
    deleteRule: vi.fn().mockResolvedValue(undefined),
    setConflictStatus: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn().mockResolvedValue(undefined),
    redo: vi.fn().mockResolvedValue(undefined),
    canUndo: vi.fn(() => false),
    canRedo: vi.fn(() => false),
  };
});

describe('Mentis Diary workspace', () => {
  it('opens an entry from an empty calendar slot with keyboard access and validates the time range', async () => {
    const user = userEvent.setup();
    renderDiary();

    const emptySlot = screen.getByRole('button', { name: /Create a one-hour diary entry on Monday .* at 09:00/ });
    emptySlot.focus();
    fireEvent.keyDown(emptySlot, { key: 'Enter' });

    const dialog = await screen.findByRole('dialog', { name: 'New diary entry' });
    const starts = within(dialog).getByLabelText('Starts') as HTMLInputElement;
    const ends = within(dialog).getByLabelText('Ends') as HTMLInputElement;
    expect(starts.value.endsWith('T09:00')).toBe(true);
    expect(ends.value.endsWith('T10:00')).toBe(true);
    expect(within(dialog).getByLabelText('Entry type')).toHaveValue('available');

    fireEvent.change(ends, { target: { value: `${starts.value.slice(0, 10)}T08:30` } });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/end must be after the start/i);
    expect(within(dialog).getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  it('uses the mobile day layout and keeps accessible date/time move controls available', async () => {
    const user = userEvent.setup();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(max-width: 720px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
    try {
      renderDiary();
      expect(screen.queryByRole('radio', { name: 'Week' })).not.toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Agenda' })).toBeInTheDocument();

      for (let index = 0; index < 4; index += 1) {
        await user.click(screen.getByRole('button', { name: 'Previous date range' }));
      }
      await user.click(await screen.findByRole('button', { name: /Team leaders meeting/ }));
      const details = screen.getByRole('dialog', { name: 'Entry details' });
      await user.click(within(details).getByRole('button', { name: 'Move to date & time' }));
      const moveDialog = await screen.findByRole('dialog', { name: 'Move diary entry' });
      expect(within(moveDialog).getByLabelText('New date')).toBeInTheDocument();
      expect(within(moveDialog).getByLabelText('New start time')).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('previews booking overlaps before saving a moved blocking commitment', async () => {
    const user = userEvent.setup();
    renderDiary();

    const bookedSession = mocks.diary.state.events.find((event: any) => event.sourceId === 'sess-u11' && event.staffId === DEMO_ME);
    expect(bookedSession).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next date range' }));
    await user.click((await screen.findAllByRole('button', { name: /Family trip — York/ }))[0]);
    const details = screen.getByRole('dialog', { name: 'Entry details' });
    await user.click(within(details).getByRole('button', { name: 'Move to date & time' }));

    const moveDialog = await screen.findByRole('dialog', { name: 'Move diary entry' });
    fireEvent.change(within(moveDialog).getByLabelText('New date'), {
      target: { value: dateKey(new Date(bookedSession.start)) },
    });
    await user.click(within(moveDialog).getByRole('button', { name: 'Move entry' }));

    const editor = await screen.findByRole('dialog', { name: 'Edit diary entry' });
    expect(await within(editor).findByLabelText('Booking conflict preview')).toHaveTextContent('U11 Juniors');
    const keepAnyway = within(editor).getByLabelText(/Keep anyway/);
    expect(within(editor).getByRole('button', { name: /^Save$/ })).toBeDisabled();
    await user.click(keepAnyway);
    await user.click(within(editor).getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(mocks.diary.updateEntry).toHaveBeenCalled());
  });

  it('keeps bookings read-only while offering an authorized, conflict-checked move request', async () => {
    const user = userEvent.setup();
    renderDiary();

    await user.click(screen.getByRole('button', { name: 'Next date range' }));
    const session = await screen.findByRole('button', { name: /U11 Juniors, 18:00.*system booking, read only/ });
    await user.click(session);

    const details = screen.getByRole('dialog', { name: 'Entry details' });
    expect(within(details).getByText('Read-only in diary')).toBeInTheDocument();
    expect(within(details).getByRole('button', { name: 'Open session' })).toBeInTheDocument();
    await user.click(within(details).getByRole('button', { name: 'Move to date & time' }));

    const moveDialog = await screen.findByRole('dialog', { name: 'Move diary entry' });
    expect(within(moveDialog).getByText(/diary will stay unchanged until you review and confirm/)).toBeInTheDocument();
    await user.clear(within(moveDialog).getByLabelText('New start time'));
    await user.type(within(moveDialog).getByLabelText('New start time'), '18:15');
    await user.click(within(moveDialog).getByRole('button', { name: 'Review move request' }));

    const confirmation = await screen.findByRole('dialog', { name: 'Confirm session reschedule' });
    expect(within(confirmation).getByRole('alert')).toHaveTextContent(/marked vacation/i);
    expect(within(confirmation).getByText(/Hard conflict/)).toBeInTheDocument();
    expect(within(confirmation).getByRole('button', { name: 'Continue to session' })).toBeDisabled();
    expect(mocks.diary.updateEntry).not.toHaveBeenCalled();
    expect(mocks.diary.createEntry).not.toHaveBeenCalled();
  });
});
