import {describe,it,expect} from 'vitest';
import {rollupColour,detectBreach,venueConcurrencyBreach,staffOverlapBreach,rankSubstitutes,overlaps,applyOverrides,overriddenFields,validateBooking,withinCancellationWindow,autoSuggest,suggestPartners} from '@mentis/core';
describe('breach & colour logic (rule 9)',()=>{
 it('missing coach = RED, missing sparrer = AMBER, none = GREEN',()=>{
  const exp=[{staffId:'c',capacity:'lead' as const},{staffId:'s',capacity:'sparrer' as const}];
  expect(detectBreach(exp,new Set(['c'])).colour).toBe('RED');
  expect(detectBreach(exp,new Set(['s'])).colour).toBe('AMBER');
  expect(detectBreach(exp,new Set()).colour).toBe('GREEN');
  expect(rollupColour(['GREEN','AMBER','GREEN'])).toBe('AMBER');
  expect(rollupColour(['AMBER','RED'])).toBe('RED');
 });
 it('venue concurrency + staff overlap; back-to-back allowed',()=>{
  expect(venueConcurrencyBreach({start:'2026-01-01T10:00Z',end:'2026-01-01T11:00Z'},[{start:'2026-01-01T10:30Z',end:'2026-01-01T11:30Z'}],1)).toBe(true);
  expect(venueConcurrencyBreach({start:'2026-01-01T10:00Z',end:'2026-01-01T11:00Z'},[{start:'2026-01-01T10:30Z',end:'2026-01-01T11:30Z'}],2)).toBe(false);
  expect(staffOverlapBreach('c',{start:'a',end:'b'} as any,[])).toBe(false);
  expect(overlaps('2026-01-01T10:00Z','2026-01-01T11:00Z','2026-01-01T11:00Z','2026-01-01T12:00Z')).toBe(false);
  expect(rankSubstitutes([{staffId:'a',capacity:'lead',available:true,conflictFree:true,venueMatched:true}],'lead')).toHaveLength(1);
 });
 it('override precedence keeps originals visible',()=>{
  const inst={date:'2026-09-07',venueId:'v1',start:'2026-09-07T18:00:00Z',end:'2026-09-07T19:00:00Z',scheduleId:'w1',staff:[]};
  const r=applyOverrides(inst,[{id:'1',from:'2026-09-07T00:00:00Z',to:'2026-09-07T23:59:59Z',venueId:'v2'}]);
  expect(r.overridden).toBe(true);expect(overriddenFields(r)).toEqual(['venue']);
 });
 it('1-2-1 booking: conflict-checked + cancellation window',()=>{
  const slot={id:'s',coachId:'c',venueId:'v',weekday:1,startTime:'18:00',durationMinutes:60,fixedPriceCents:3000,status:'open'} as const;
  expect(validateBooking(slot,'2026-01-05T18:00:00Z',[{start:'2026-01-05T18:30:00Z',end:'2026-01-05T19:30:00Z'}])).toContain('coach has a conflicting session');
  expect(validateBooking(slot,'2026-01-05T18:00:00Z',[])).toHaveLength(0);
  expect(withinCancellationWindow({slotId:'s',memberId:'m',startsAt:'2026-01-06T18:00:00Z',status:'booked',cancellationWindowHours:24} as any,'2026-01-05T18:00:00Z')).toBe(true);
  expect(autoSuggest([{memberId:'a',age:14,rankBand:2}],{ageMin:13,ageMax:15,rankMin:1,rankMax:3})).toHaveLength(1);
  expect(suggestPartners([{memberId:'a',rankBand:2,age:14}],{rankBand:2},14)).toHaveLength(1);
 });
});
