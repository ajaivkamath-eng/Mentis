import { describe, expect, it } from 'vitest';
import { getActiveRateCardsForStaff, getDefaultRateCardId } from '../pages/staffing';

describe('staffing rate defaults', () => {
  it('prefers the most recent active standard card for the selected staff', () => {
    const cards = [
      { id: 'old', staff_id: 'staff-1', label: 'Standard', rate_cents: 2500, valid_from: '2024-01-01', valid_to: '2024-12-31' },
      { id: 'current', staff_id: 'staff-1', label: 'Standard', rate_cents: 2600, valid_from: '2025-01-01', valid_to: null },
      { id: 'premium', staff_id: 'staff-1', label: 'Premium', rate_cents: 4000, valid_from: '2025-01-01', valid_to: null },
    ];

    expect(getActiveRateCardsForStaff('staff-1', cards)).toHaveLength(2);
    expect(getDefaultRateCardId('staff-1', cards)).toBe('current');
  });

  it('returns an empty selection when no active rate cards exist for that staff', () => {
    const cards = [
      { id: 'expired', staff_id: 'staff-1', label: 'Standard', rate_cents: 2500, valid_from: '2024-01-01', valid_to: '2024-12-31' },
      { id: 'other-staff', staff_id: 'staff-2', label: 'Standard', rate_cents: 2800, valid_from: '2025-01-01', valid_to: null },
    ];

    expect(getActiveRateCardsForStaff('staff-1', cards)).toHaveLength(0);
    expect(getDefaultRateCardId('staff-1', cards)).toBe('');
  });
});
