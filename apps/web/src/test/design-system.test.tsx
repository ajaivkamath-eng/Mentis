import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../lib/theme';
import { DesignSystem } from '../pages/design-system';
import { Toaster } from '../components/ui/toast';
import { TooltipProvider } from '../components/ui/menu';

/**
 * The style guide renders every primitive at once, so this single test is the
 * broadest smoke test in the suite: if a token, a Radix wrapper, a Framer
 * variant or a form control breaks, this file fails.
 */
function renderPage() {
  return render(
    <ThemeProvider>
      {/* In the app the shell mounts the tooltip provider; mirror that here. */}
      <TooltipProvider>
        <MemoryRouter initialEntries={['/design-system']}>
          <DesignSystem />
          <Toaster />
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>,
  );
}

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 0 }).then(r) }) },
  functionsUrl: (name: string) => `/functions/v1/${name}`,
}));

describe('Design system page', () => {
  it('renders every documented section', () => {
    renderPage();
    for (const heading of [
      'Design system',
      'Foundations',
      'Colour',
      'Typography',
      'Motion',
      'Components',
      'Patterns',
      'Native parity',
    ]) {
      expect(screen.getAllByText(heading, { selector: 'h1,h2,h3,h4,span,div' }).length).toBeGreaterThan(0);
    }
  });

  it('renders the KPI grid with formatted money and animated values', async () => {
    renderPage();
    expect(await screen.findByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Outstanding debits')).toBeInTheDocument();
    // pence → GBP formatting is part of the design system contract.
    await waitFor(() => expect(screen.getByText('£1,294.50')).toBeInTheDocument());
  });

  it('renders the sessions table with capacity meters and status badges', () => {
    renderPage();
    const table = screen.getAllByRole('table')[0];
    expect(within(table).getByRole('columnheader', { name: /session/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Junior Development/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Breached|Scheduled/).length).toBeGreaterThan(0);
  });

  it('opens the example dialog and reports the result as a toast', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /open dialog/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('New session')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /create session/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Session created')).toBeInTheDocument();
  });

  it('confirms destructive actions before applying them', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /confirm pattern/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Cancel this session\?/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^cancel session$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Session cancelled')).toBeInTheDocument();
  });

  it('switches the preview theme from the header control', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false));
  });
});
