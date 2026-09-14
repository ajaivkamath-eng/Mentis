import {describe,it,expect} from 'vitest';
import {applyOverrides} from '@mentis/core';
const instance={date:'2026-09-07',venueId:'v1',start:'2026-09-07T18:00:00Z',end:'2026-09-07T19:00:00Z',scheduleId:'w1',staff:[{staffId:'c1',capacity:'lead' as const}]};
describe('schedule overrides',()=>{it('keeps originals and applies changes',()=>{const r=applyOverrides(instance,[{id:'1',from:'2026-09-07T00:00:00Z',to:'2026-09-07T23:59:59Z',venueId:'v2',start:'2026-09-07T19:00:00Z',end:'2026-09-07T20:00:00Z'}]);expect(r.overridden).toBe(true);expect(r.venueId).toBe('v2');expect(r.original.venueId).toBe('v1');});it('does not alter out-of-range instances',()=>expect(applyOverrides(instance,[{id:'1',from:'2026-09-08',to:'2026-09-09',venueId:'v2'}]).overridden).toBe(false));});
