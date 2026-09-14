import {describe,it,expect} from 'vitest';
import {buildDraftLines,approveInvoice,markInvoicePaid,reInvoiceable,resolveCustomerCharge,customerBalanceDue,billingDashboard,invoiceTotalCents} from '@mentis/core';
const entry=(id:string,over={})=>({id,staffId:'coach-1',date:'2026-01-05',start:'2026-01-05T10:00:00Z',end:'2026-01-05T11:00:00Z',hours:2,rateCents:2500,billable:true,billState:'unbilled' as const,pendingReview:false,...over});
describe('billing lock (Day 1-10 scenario)',()=>{
 it('drafts from unbilled items only, locks on approval',()=>{
  const lines=buildDraftLines({staffId:'coach-1',periodStart:'2026-01-01',periodEnd:'2026-01-10',entries:[entry('e1'),entry('e2',{billState:'billed'})],tasks:[]});
  expect(lines.map(l=>l.timeEntryId)).toEqual(['e1']);
  const inv=approveInvoice({id:'i',staffId:'coach-1',periodStart:'2026-01-01',periodEnd:'2026-01-10',status:'draft',lines});
  expect(inv.status).toBe('approved');
  expect(()=>approveInvoice(inv)).toThrow();
 });
 it('re-invoice shows only NEW or backfilled items',()=>{
  const items=reInvoiceable([entry('e1'),entry('e3'),entry('e4',{source:'backfill'})],new Set(['e1']));
  expect(items.map(e=>e.id)).toEqual(['e3','e4']);
  expect(reInvoiceable([entry('e1')],new Set(['e1']))).toHaveLength(0); // truthful "nothing billable"
 });
 it('unapproved tasks never invoice; approved fixed-price tasks do',()=>{
  const tasks=[{id:'t1',organizationId:'o',title:'camp',type:'campaign',assigneeId:'coach-1',status:'done',amountCents:5000} as any,{id:'t2',organizationId:'o',title:'121',type:'oneOnOne',assigneeId:'coach-1',status:'done',approvedAt:'2026-01-02',amountCents:3000} as any];
  const lines=buildDraftLines({staffId:'coach-1',periodStart:'2026-01-01',periodEnd:'2026-01-10',entries:[],tasks});
  expect(lines.map(l=>l.taskId)).toEqual(['t2']);
 });
 it('paid lifecycle + outstanding dashboard',()=>{
  const inv=markInvoicePaid(approveInvoice({id:'i',staffId:'s',periodStart:'a',periodEnd:'b',status:'draft',lines:[{id:'l',staffId:'s',hours:1,rateCents:100,amountCents:100}]}),'2026-01-11','BANK-1');
  expect(inv.status).toBe('paid');
  const d=billingDashboard([inv],[entry('e9')],[]);
  expect(d.invoicedCents).toBe(100);
  expect(d.outstandingCents).toBe(5000);
 });
 it('customer charge resolves to recovered or outstanding debit with due date',()=>{
  const c={id:'c',taskId:'t',customerId:'cu',amountCents:3000,status:'approved'} as any;
  expect(resolveCustomerCharge(c,true).status).toBe('recovered');
  expect(()=>resolveCustomerCharge(c,false)).toThrow();
  expect(resolveCustomerCharge(c,false,'2026-02-01').status).toBe('outstandingDebit');
  expect(customerBalanceDue([resolveCustomerCharge(c,false,'2026-02-01')])).toBe(3000);
  expect(invoiceTotalCents([{amountCents:100} as any])).toBe(100);
 });
});
