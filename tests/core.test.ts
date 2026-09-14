import {describe,it,expect} from 'vitest';
import {validateMember, assertFeedbackSource, staffingColour, billableEntries} from '@mentis/core';
describe('foundation rules',()=>{
 it('requires guardian and NOK for minors',()=>expect(validateMember({id:'1',dateOfBirth:'2015-01-01',specialNeedsFlag:false} as any)).toHaveLength(2));
 it('requires feedback source',()=>expect(()=>assertFeedbackSource('session')).toThrow());
 it('worst staffing colour wins',()=>expect(staffingColour({id:'s',venueId:'v',start:'2026-01-01T10:00Z',end:'2026-01-01T11:00Z',assignments:[{staffId:'c',capacity:'lead',rateCents:1,start:'',end:''},{staffId:'s',capacity:'sparrer',rateCents:1,start:'',end:''}]},new Set(['s']))).toBe('AMBER'));
 it('excludes billed and pending entries',()=>expect(billableEntries([{id:'1',staffId:'s',date:'2026-01-01',start:'',end:'',hours:1,rateCents:1,billable:true,billState:'billed',pendingReview:false}], '2026-01-01','2026-01-02')).toHaveLength(0));
});
