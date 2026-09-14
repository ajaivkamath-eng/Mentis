import type { Member } from './domain.js';
export function validateMember(member: Member, at = new Date()): string[] {
  const dob = new Date(member.dateOfBirth);
  const age = at.getUTCFullYear() - dob.getUTCFullYear() - ((at.getUTCMonth() < dob.getUTCMonth() || (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate())) ? 1 : 0);
  const errors:string[] = [];
  if (Number.isNaN(dob.valueOf())) errors.push('dateOfBirth is invalid');
  if (age < 18 && !member.customerId) errors.push('members under 18 require a partner or guardian customer');
  if (age < 18 && (!member.nokName || !member.nokPhone)) errors.push('members under 18 require NOK name and phone');
  return errors;
}
export function assertFeedbackSource(sourceType:'session'|'event', sourceId?:string): void {
  if (!sourceId) throw new Error(`${sourceType} feedback requires a source`);
}
