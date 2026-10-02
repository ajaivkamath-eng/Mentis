import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RateCards } from '../pages/manage';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    staff: { organization_id: 'org-1', user_id: 'user-1' },
  }),
}));

const mockRateCards = [
  {
    id: 'card-1',
    organization_id: 'org-1',
    staff_id: 'staff-1',
    label: 'Standard',
    rate_cents: 2500,
    valid_from: '2025-01-01',
    valid_to: null,
    mentis_staff: { display_name: 'Alex Coach' },
  },
];

const mockStaff = [{ id: 'staff-1', display_name: 'Alex Coach' }];

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'mentis_rate_cards') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: mockRateCards }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          insert: () => Promise.resolve({ error: null }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }

      if (table === 'mentis_staff') {
        return {
          select: () => Promise.resolve({ data: mockStaff }),
        };
      }

      return {
        select: () => Promise.resolve({ data: [] }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: () => Promise.resolve({ error: null }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
  },
}));

describe('RateCards spreadsheet selection', () => {
  it('disables native text selection on the grid surface so Excel-style range selection can take over', async () => {
    render(<RateCards />);

    await waitFor(() => expect(screen.getAllByText('Alex Coach').length).toBeGreaterThan(0));

    const grid = document.querySelector('table');
    expect(grid).not.toBeNull();
    expect(grid).toHaveStyle({ userSelect: 'none' });

    const cellValue = within(grid!).getAllByText('Alex Coach').find((node) => node.tagName === 'SPAN');
    expect(cellValue).toBeDefined();
    expect(cellValue?.closest('td')).toHaveStyle({ userSelect: 'none' });
  });
});
