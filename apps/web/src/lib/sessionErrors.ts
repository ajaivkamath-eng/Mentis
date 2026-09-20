export function explainSessionInsertError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';

  if (!message) return 'The session could not be created. Please check the date, venue, and holiday rules.';

  const normalized = message.toLowerCase();

  if (normalized.includes('holiday') || normalized.includes('no-session day')) {
    return 'This session falls on a configured holiday or no-session day. Choose a different date or remove the holiday restriction for this slot.';
  }

  if (normalized.includes('concurrency') || normalized.includes('limit')) {
    return 'This slot conflicts with another session in the same venue. Please choose a different time or venue.';
  }

  if (normalized.includes('overlap') || normalized.includes('already has an overlapping session')) {
    return 'This session overlaps with an existing booking for the same coach or venue. Please adjust the time window.';
  }

  if (normalized.includes('not null') || normalized.includes('null')) {
    return 'A required field is missing. Please complete the session name, venue, and date/time before saving.';
  }

  return `The session could not be created: ${message}`;
}

export function explainNoGeneratedDates({
  skipBankHolidays,
  skipTermHolidays,
  range,
}: {
  skipBankHolidays?: boolean;
  skipTermHolidays?: boolean;
  range?: string;
}) {
  const reasons: string[] = [];

  if (skipBankHolidays) reasons.push('bank holiday filters');
  if (skipTermHolidays) reasons.push('term holiday filters');
  if (!reasons.length) reasons.push('the selected recurrence range');

  const holidayText = reasons.length > 1 ? reasons.join(' and ') : reasons[0];
  const rangeText = range ? ` for ${range}` : '';

  return `No sessions were generated${rangeText} because the selected dates were filtered out by ${holidayText}. Please widen the date range or disable the holiday skips.`;
}
