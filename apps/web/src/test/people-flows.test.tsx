import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AddCustomerWizard } from '../pages/AddCustomerWizard';
import { Protected } from '../lib/ui';
import { AddMemberWizard } from '../pages/AddMemberWizard';
import { PeopleWorkspace } from '../pages/PeopleWorkspace';
import { Customer360, Member360 } from '../pages/entities';

const activeRole = vi.hoisted(() => ({ value: 'SUPER_ADMIN' }));

vi.mock('../lib/auth', () => ({
  useAuth: () => {
    const permissions: Record<string, string[]> = {
      SUPER_ADMIN: ['customers.manage', 'customers.view', 'billing.viewAll', 'charges.manage', 'gdpr.export', 'medical.view'],
      ADMIN: ['customers.manage', 'customers.view', 'billing.viewAll', 'charges.manage', 'gdpr.export', 'medical.view'],
      COACH: ['customers.view', 'medical.view'],
      SPARRER: ['customers.registerView'],
    };
    return {
      userId: 'demo-user-0000',
      staff: { id: 'demo-staff-0000', organization_id: 'demo-org-0000', user_id: 'demo-user-0000', display_name: `Demo ${activeRole.value}`, roles: [activeRole.value] },
      role: activeRole.value, roles: [activeRole.value], loading: false, setRole: vi.fn(),
      canDo: (permission: string) => permissions[activeRole.value]?.includes(permission) ?? false, signOut: vi.fn(),
    };
  },
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => { throw new Error('demo people flows must not call Supabase'); } },
  functionsUrl: (name: string) => `/functions/v1/${name}`,
}));

function renderPeopleRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/people" element={<PeopleWorkspace />} />
        <Route path="/members/new" element={<AddMemberWizard />} />
        <Route path="/members/:id" element={<Member360 />} />
        <Route path="/customers/new" element={<AddCustomerWizard />} />
        <Route path="/customers/:id" element={<Customer360 />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('People Workspace flows', () => {
  beforeEach(() => { localStorage.clear(); activeRole.value = 'SUPER_ADMIN'; });

  it('switches between the distinct member and customer directories', async () => {
    const user = userEvent.setup();
    renderPeopleRoutes('/people');

    expect(await screen.findByRole('textbox', { name: 'Search members' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Customers/ }));
    expect(await screen.findByRole('textbox', { name: 'Search customers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Members/ })).toBeInTheDocument();
  });

  it('requires a customer and next-of-kin details before saving a junior member', async () => {
    const user = userEvent.setup();
    renderPeopleRoutes('/members/new');

    await user.type(screen.getByPlaceholderText('e.g. Ava Mitchell'), 'Morgan Example');
    fireEvent.change(screen.getByLabelText(/Date of birth/), { target: { value: '2014-06-15' } });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Under-18 safeguard.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Create a customer inline/ }));
    await user.type(screen.getAllByPlaceholderText('Full name')[0], 'Taylor Example');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getAllByText(/next-of-kin name is required/i).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(/Next-of-kin name/), 'Casey Example');
    await user.type(screen.getByLabelText(/Next-of-kin phone/), '07700 900300');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Save member' }));

    expect((await screen.findAllByRole('heading', { name: 'Morgan Example' })).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Taylor Example').length).toBeGreaterThan(0);
  });


  it('keeps customer finance out of coach views and blocks sparrer household profiles', async () => {
    activeRole.value = 'COACH';
    renderPeopleRoutes('/customers/demo-customer-daniel');

    expect((await screen.findAllByRole('heading', { name: 'Daniel Okafor' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('radio', { name: /Charges/ })).not.toBeInTheDocument();
    expect(screen.queryByText('£12.00')).not.toBeInTheDocument();
    expect(screen.queryByText('Customer charges')).not.toBeInTheDocument();

    activeRole.value = 'SPARRER';
    render(
      <MemoryRouter>
        <Protected perm="customers.view"><PeopleWorkspace /></Protected>
      </MemoryRouter>,
    );
    expect(screen.getByText('Not permitted')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'People' })).not.toBeInTheDocument();
  });

  it('records consent state and flags an expired grant on Customer 360', async () => {
    const user = userEvent.setup();
    renderPeopleRoutes('/customers/new');

    await user.type(screen.getByLabelText(/Account-holder name/), 'Jordan Example');
    const states = screen.getAllByRole('combobox', { name: 'State' });
    await user.selectOptions(states[0], 'granted');
    const expiryFields = screen.getAllByLabelText('Expires');
    fireEvent.change(expiryFields[0], { target: { value: '2025-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Save customer' }));

    expect((await screen.findAllByRole('heading', { name: 'Jordan Example' })).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('radio', { name: /Consent/ }));
    expect(await screen.findByText('Photography & video')).toBeInTheDocument();
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
    expect(screen.getByText(/Expired or withdrawn consent is never treated as valid/)).toBeInTheDocument();
  });
});
