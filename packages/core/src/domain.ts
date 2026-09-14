export type Role = 'SUPER_ADMIN'|'ADMIN'|'COACH'|'SPARRER';
export type AttendanceStatus = 'present'|'absent'|'late'|'taster';
export type StaffingColour = 'GREEN'|'AMBER'|'RED';
export interface Member { id:string; customerId?:string; dateOfBirth:string; specialNeedsFlag:boolean; specialNeeds?:string; nokName?:string; nokPhone?:string; }
export interface Customer { id:string; name:string; phone?:string; }
export interface Staff { id:string; userId:string; roles:Role[]; }
export interface SessionAssignment { staffId:string; capacity:'lead'|'assistant'|'sparrer'; rateCents:number; start:string; end:string; }
export interface SessionInstance { id:string; venueId:string; start:string; end:string; assignments:SessionAssignment[]; }
export interface AttendanceRecord { id:string; sessionInstanceId:string; memberId?:string; tasterId?:string; status:AttendanceStatus; recordedAt:string; recordedBy:string; offline:boolean; }
export interface TimeEntry { id:string; staffId:string; date:string; start:string; end:string; hours:number; rateCents:number; billable:boolean; billState:'unbilled'|'billed'; pendingReview:boolean; }
export interface InvoiceLine { id:string; timeEntryId?:string; taskId?:string; staffId:string; hours:number; rateCents:number; amountCents:number; }
export interface Invoice { id:string; staffId:string; periodStart:string; periodEnd:string; status:'draft'|'pendingApproval'|'approved'|'paid'; lines:InvoiceLine[]; }
export interface SportProfile { id:string; name:string; feedbackAttributeTemplates:Record<string,string[]>; }
