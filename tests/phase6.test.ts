import {describe,it,expect} from 'vitest';
import {buildProgressSummary,bookingToTask,withinCancellationWindow,conversionPack,appendPreset,goalDue} from '@mentis/core';
describe('phase 6 flows',()=>{
 it('builds a termly progress summary',()=>{
  const s=buildProgressSummary({
   attendance:[{status:'present'},{status:'present'},{status:'absent'}] as any,
   ratingSeries:{'skill:serve':[{at:'2026-01-01',score:5},{at:'2026-02-01',score:7}]},
   rankingsByPlatform:{tte:[{source:'tte',value:100,asOfDate:'2026-01-01'},{source:'tte',value:80,asOfDate:'2026-02-01'}]},
   matches:[{result:'W',date:'2026-02-01',opponent:'X'},{result:'L',date:'2026-02-08',opponent:'Y'}] as any,
   goals:[{status:'achieved'},{status:'inProgress'}] as any,
  });
  expect(s.attendancePct).toBe(67);
  expect(s.ratingTrends['skill:serve']).toBe('up');
  expect(s.rankMovement.tte).toBe('up');
  expect(s.winLoss).toEqual({wins:1,losses:1,draws:0});
  expect(s.form).toEqual(['L','W']);
  expect(s.goals).toEqual({achieved:1,inProgress:1});
 });
 it('booking creates an approval-gated chargeable task',()=>{
  const t=bookingToTask({slotId:'s',memberId:'m',startsAt:'2026-03-01T10:00:00Z',status:'booked',cancellationWindowHours:24} as any,{coachId:'c',fixedPriceCents:3000} as any,'cust');
  expect(t.type).toBe('oneOnOne');expect(t.amountCents).toBe(3000);expect(t.chargeableToCustomer).toBe(true);expect(t.status).toBe('todo');
  expect(withinCancellationWindow({startsAt:'2026-03-01T10:00:00Z',cancellationWindowHours:24} as any,'2026-02-28T10:00:00Z')).toBe(true);
  expect(withinCancellationWindow({startsAt:'2026-03-01T10:00:00Z',cancellationWindowHours:24} as any,'2026-03-01T09:00:00Z')).toBe(false);
 });
 it('conversion pack + presets + goal due',()=>{
  expect(conversionPack('guide','note').guide).toBe('guide');
  expect(appendPreset('a','b')).toBe('a\nb');
  expect(goalDue({status:'inProgress',targetDate:'2026-01-01'} as any,'2026-02-01')).toBe(true);
 });
});
