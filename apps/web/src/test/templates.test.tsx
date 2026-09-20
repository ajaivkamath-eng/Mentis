/**
 * Session blueprints — page tests.
 *
 * Runs against the design-review demo store, so the assertions exercise the
 * real screen: the blueprint rail and detail, the instance provenance table,
 * the publish dialog and — most importantly — the recurrence preview, which
 * must agree with the generator (term-break skipping included) because the
 * dialog promises "exactly what will be created".
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../lib/theme';
import { SessionTemplates } from '../pages/templates';

const authState = { canManage: true };

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    userId: 'user-1',
    staff: {
      id: 'demo-staff-0000',
      organization_id: 'demo-org-0000',
      user_id: 'user-1',
      display_name: 'Alex Morgan',
      roles: ['SUPER_ADMIN', 'ADMIN'],
    },
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    loading: false,
    setRole: vi.fn(),
    canDo: () => authState.canManage,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => { throw new Error('demo mode must not query supabase'); },
    rpc: () => { throw new Error('demo mode must not call supabase'); },
    auth: { signOut: async () => {} },
  },
  functionsUrl: (name: string) => `/functions/v1/${name}`,
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <SessionTemplates />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

/** Open the publish dialog from the blueprint detail header. */
async function openPublish(user: ReturnType<typeof userEvent.setup>) {
  const buttons = await screen.findAllByRole('button', { name: /publish series/i });
  await user.click(buttons[0]);
  return screen.findByText('Publish a series');
}

/** Pin the rule to a deterministic window so the preview can be asserted. */
function setWindow(from: string, until: string) {
  fireEvent.change(screen.getByLabelText('From'), { target: { value: from } });
  fireEvent.change(screen.getByLabelText('Until'), { target: { value: until } });
}

function selectWeekday(name: string) {
  const button = screen.getByRole('button', { name });
  if (!button.className.includes('btn-primary')) fireEvent.click(button);
}

describe('session blueprints page', () => {
  it('lists blueprints with the facts a session is copied from', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Session blueprints' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'U13 Development' })).toBeInTheDocument();
    expect(screen.getByText('U13-MON')).toBeInTheDocument();
    expect(screen.getAllByText('Kingfisher Hall A').length).toBeGreaterThan(0);

    // The blueprint owns venue, slot, coaches and the staffing plan.
    expect(screen.getByText('Venue')).toBeInTheDocument();
    expect(screen.getByText('Coaches')).toBeInTheDocument();
    expect(screen.getByText('Staffing plan')).toBeInTheDocument();
    expect(screen.getByText('Default roster')).toBeInTheDocument();
    expect(screen.getAllByText('Sam Coach').length).toBeGreaterThan(0);
  });

  it('shows instances as published occurrences of the blueprint, flagging drift', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Instances' });
    const instances = screen.getByRole('heading', { name: 'Instances' }).closest('.card') as HTMLElement;

    // Provenance: every instance says where it came from.
    expect(within(instances).getAllByText(/blueprint v\d+/).length).toBeGreaterThan(0);
    // …DataTable renders the desktop table and the mobile card list, so the
    // row content legitimately appears more than once.
    // One demo instance was edited away from the blueprint, so it is an exception…
    expect(within(instances).getAllByText(/field\(s\) off blueprint/).length).toBeGreaterThan(0);
    expect(within(instances).getAllByRole('button', { name: /re-apply/i }).length).toBeGreaterThan(0);
    // …and the series warns that it carries edited occurrences.
    const series = screen.getByRole('heading', { name: 'Series' }).closest('.card') as HTMLElement;
    expect(within(series).getAllByText('1 edited').length).toBeGreaterThan(0);
  });

  it('previews a term of Mondays with the half-term break skipped', async () => {
    const user = userEvent.setup();
    renderPage();

    await openPublish(user);
    selectWeekday('Mon');
    setWindow('2026-02-02', '2026-03-31');

    // 2 Feb → 30 Mar = 9 Mondays, minus the 16 Feb half-term week = 8 instances.
    await waitFor(() => expect(screen.getByText('8 generated')).toBeInTheDocument());
    expect(screen.getByText('1 term-break skipped')).toBeInTheDocument();
    // The dialog describes the rule in words, not as a bare weekday list.
    expect(screen.getAllByText(/Every week on Monday\b/).length).toBeGreaterThan(0);
    // The skipped row names the holiday it clashed with.
    expect(screen.getAllByText('February half-term').length).toBeGreaterThan(0);
    // And the publish button counts what will actually be created.
    expect(screen.getByRole('button', { name: 'Publish 8 instances' })).toBeInTheDocument();
  });

  it('honours the skip switches', async () => {
    const user = userEvent.setup();
    renderPage();

    await openPublish(user);
    selectWeekday('Mon');
    setWindow('2026-02-02', '2026-03-31');

    await waitFor(() => expect(screen.getByText('8 generated')).toBeInTheDocument());
    await user.click(screen.getByLabelText('Skip term breaks'));

    await waitFor(() => expect(screen.getByText('9 generated')).toBeInTheDocument());
    expect(screen.queryByText('1 term-break skipped')).not.toBeInTheDocument();
  });

  it('turns a one-off into a single instance with no series', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'U13 Development' });
    await user.click(screen.getByRole('button', { name: /one-off/i }));

    expect(await screen.findByText('One-off from the blueprint')).toBeInTheDocument();
    const create = screen.getByRole('button', { name: /create session/i });
    // A date is required: nothing is schedulable without one.
    expect(create).toBeDisabled();
  });

  it('gates the workspace behind sessions.manage', async () => {
    authState.canManage = false;
    try {
      renderPage();
      expect(await screen.findByText('Blueprints are an admin tool')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Session blueprints' })).not.toBeInTheDocument();
    } finally {
      authState.canManage = true;
    }
  });
});
