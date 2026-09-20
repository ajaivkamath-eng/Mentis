import { describe, expect, it } from 'vitest';
import {
  explainSessionInsertError,
  explainNoGeneratedDates,
} from '../apps/web/src/lib/sessionErrors';

describe('session creation diagnostics', () => {
  it('explains holiday-blocked session inserts clearly', () => {
    const message = explainSessionInsertError({
      message: 'session falls on a holiday / no-session day',
    } as any);

    expect(message).toContain('holiday');
    expect(message).toContain('no-session day');
  });

  it('explains recurrence preview empty states clearly', () => {
    const message = explainNoGeneratedDates({
      skipBankHolidays: true,
      skipTermHolidays: true,
      range: 'May 2026',
    });

    expect(message).toContain('No sessions were generated');
    expect(message).toContain('holiday');
  });
});
