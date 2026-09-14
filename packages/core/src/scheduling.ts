import type { SessionInstance, StaffingColour } from './domain.js';
export function staffingColour(session:SessionInstance, unavailableStaffIds:Set<string>):StaffingColour {
  const missingCoach = session.assignments.some(a => (a.capacity === 'lead' || a.capacity === 'assistant') && unavailableStaffIds.has(a.staffId));
  const missingSparrer = session.assignments.some(a => a.capacity === 'sparrer' && unavailableStaffIds.has(a.staffId));
  return missingCoach ? 'RED' : missingSparrer ? 'AMBER' : 'GREEN';
}
export function overlaps(aStart:string,aEnd:string,bStart:string,bEnd:string):boolean { return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd); }
