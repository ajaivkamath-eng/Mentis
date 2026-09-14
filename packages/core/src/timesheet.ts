import type { TimeEntry } from './domain.js';
export function adjustTimeEntry(entry:TimeEntry, hours:number):TimeEntry {
  if(hours<0) throw new Error('hours cannot be negative');
  const increased=hours>entry.hours;
  return {...entry,hours,pendingReview: increased ? true : entry.pendingReview};
}
export function approveTimeIncrease(entry:TimeEntry):TimeEntry { if(!entry.pendingReview) return entry; return {...entry,pendingReview:false}; }
