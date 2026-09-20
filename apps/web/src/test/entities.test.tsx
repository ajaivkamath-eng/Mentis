import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Members, Customers, Member360, Customer360 } from '../pages/entities';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    userId: 'demo-user-0000',
    staff: { id: 'demo-staff-0000', organization_id: 'demo-org-0000', user_id: 'demo-user-0000', display_name: 'Demo Super Admin', roles: ['SUPER_ADMIN'] },
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN'],
    loading: false,
    setRole: vi.fn(),
    canDo: () => true,
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => { throw new Error('people pages should use local demo fixtures in this test'); } },
  functionsUrl: (name: string) => `/functions/v1/${name}`,
}));

function wrap(child: React.ReactNode, initialEntries = ['/']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{child}</MemoryRouter>);
}

describe('people workspace', () => {
  beforeEach(() => localStorage.clear());

  it('shows a useful member roster with search and status filters', async () => {
    const user = userEvent.setup();
    wrap(<Members />);

    expect(await screen.findByText('Ava Mitchell')).toBeInTheDocument();
    expect(screen.getAllByText('Follow-up queue').length).toBeGreaterThan(0);

    await user.type(screen.getByRole('textbox', { name: 'Search members' }), 'Noah');
    expect(screen.getAllByText('Noah Okafor').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ava Mitchell')).not.toBeInTheDocument();
  });

  it('shows households and opens the customer 360 sections', async () => {
    const user = userEvent.setup();
    const directory = wrap(<Customers />);

    expect(await screen.findByText('Sarah Mitchell')).toBeInTheDocument();
    const customerLink = screen.getByRole('link', { name: /Open Sarah Mitchell/i });
    expect(customerLink).toHaveAttribute('href', '/customers/demo-customer-sarah');

    directory.unmount();
    wrap(
      <Routes>
        <Route path="/customers/:id" element={<Customer360 />} />
      </Routes>,
      ['/customers/demo-customer-sarah'],
    );
    expect((await screen.findAllByRole('heading', { name: 'Sarah Mitchell' })).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('radio', { name: /Activity/i }));
    expect(screen.getByText('Household activity')).toBeInTheDocument();
  });

  it('keeps member 360 focused on attendance and development context', async () => {
    wrap(
      <Routes>
        <Route path="/members/:id" element={<Member360 />} />
      </Routes>,
      ['/members/demo-member-ava'],
    );

    expect((await screen.findAllByRole('heading', { name: 'Ava Mitchell' })).length).toBeGreaterThan(0);
    expect(screen.getByText('Attendance pulse')).toBeInTheDocument();
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
  });
});
