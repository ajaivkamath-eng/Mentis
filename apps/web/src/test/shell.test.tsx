import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../lib/theme';
import { AppShell } from '../components/layout/app-shell';
import { CommandPaletteProvider } from '../components/patterns/command-palette';

/* -------------------------------------------------------------------------- *
 * The shell is the one component every page inherits, so it is worth testing
 * hard: navigation, collapse, command palette, alerts and the theme control.
 * -------------------------------------------------------------------------- */

const signOut = vi.fn();

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    userId: 'user-1',
    staff: {
      id: 'staff-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      display_name: 'Ava Kamath',
      roles: ['SUPER_ADMIN', 'COACH'],
    },
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN', 'COACH'],
    loading: false,
    setRole: vi.fn(),
    canDo: () => true,
    signOut,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

/* Chainable Supabase stub — the shell only asks for action counts. */
vi.mock('../lib/supabase', () => {
  const result = { count: 2, data: [], error: null };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: chain,
    in: chain,
    order: chain,
    limit: chain,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  });
  return {
    supabase: { from: () => builder, auth: { signOut: async () => {} } },
    functionsUrl: (name: string) => `/functions/v1/${name}`,
  };
});

function renderShell() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <AppShell>
            <div>Page content</div>
          </AppShell>
        </CommandPaletteProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    signOut.mockClear();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('renders the brand, grouped navigation and the signed-in user', () => {
    renderShell();
    expect(screen.getAllByText('Mentis').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kingfisher TTC').length).toBeGreaterThan(0);

    // Grouped nav: headings are buttons so they can collapse.
    expect(screen.getAllByRole('button', { name: /Coaching/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Members/ })).toBeInTheDocument();
    expect(screen.getByText('Ava Kamath')).toBeInTheDocument();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('collapses to an icon rail and remembers the choice', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getAllByRole('button', { name: /collapse sidebar/i })[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /expand sidebar/i }).length).toBeGreaterThan(0);
    });
    // Persisted so the preference survives a reload.
    await waitFor(() => expect(localStorage.getItem('mentis.railCollapsed')).toBe('true'));
  });

  it('exposes live action counts on the notification bell', async () => {
    renderShell();
    const bell = screen.getByRole('button', { name: /action queue/i });
    expect(bell).toBeInTheDocument();
    await waitFor(() => expect(bell.getAttribute('aria-label')).toMatch(/2 breached/));
  });

  it('opens the command palette with Ctrl+K and filters to permitted routes', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.keyboard('{Control>}k{/Control}');

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: /search commands/i });
    expect(input).toBeInTheDocument();

    await user.type(input, 'billing');
    await waitFor(() => {
      expect(within(dialog).getByText('Billing')).toBeInTheDocument();
    });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('flips the theme by toggling the .dark class on <html>', async () => {
    const user = userEvent.setup();
    renderShell();

    // Dark is the default in the test environment (matchMedia stub reports light=false).
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));

    await user.click(screen.getAllByRole('radio', { name: 'Light' })[0]);
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false));

    await user.click(screen.getAllByRole('radio', { name: 'Dark' })[0]);
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  });

  it('warns when the browser goes offline', async () => {
    renderShell();
    const { act } = await import('@testing-library/react');
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/offline/i);
  });
});
