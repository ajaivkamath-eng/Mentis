import {describe,it,expect} from 'vitest';
import {generateSchedule,findConflicts,normalizeHolidayKind} from '@mentis/core';
const schedule={id:'w1',venueId:'v1',dayOfWeek:1,validFrom:'2026-09-07',validTo:'2026-09-28',startTime:'18:00',endTime:'19:00',staff:[{staffId:'coach',capacity:'lead' as const}]};
describe('weekly schedule generation',()=>{
 it('generates matching weekdays and skips holidays',()=>{const r=generateSchedule(schedule,[{kind:'bank_holiday',startsOn:'2026-09-14',endsOn:'2026-09-14'}]);expect(r.map(x=>x.date)).toEqual(['2026-09-07','2026-09-21','2026-09-28']);});
 it('classifies term and bank holiday rows correctly',()=>{
  expect(normalizeHolidayKind({kind:'term_holiday_week',name:'Term 1 Holiday Week'})).toBe('term_break');
  expect(normalizeHolidayKind({kind:'bank_holiday',name:'Summer bank holiday'})).toBe('bank_holiday');
  expect(normalizeHolidayKind({kind:'manual',name:'Custom closure'})).toBe('manual');
 });
 it('allows back-to-back sessions',()=>{const a=generateSchedule(schedule)[0];const b={...a,start:'2026-09-07T19:00:00Z',end:'2026-09-07T20:00:00Z'};expect(findConflicts(b,[a])).toHaveLength(0);});
 it('blocks venue and staff overlap',()=>{const a=generateSchedule(schedule)[0];const b={...a,start:'2026-09-07T18:30:00Z',end:'2026-09-07T19:30:00Z'};expect(findConflicts(b,[a]).map(x=>x.type)).toEqual(['venue','staff']);});
});
