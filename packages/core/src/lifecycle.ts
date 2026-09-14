export type TasterStatus='requested'|'approved'|'attended'|'converted'|'closed';
export type Taster={id:string;name:string;age:number;status:TasterStatus;approvedSessionIds:string[]};
export function approveTaster(t:Taster,sessionIds:string[]):Taster{if(!sessionIds.length)throw new Error('at least one session is required');if(t.status!=='requested')throw new Error('only requested tasters can be approved');return {...t,status:'approved',approvedSessionIds:[...new Set(sessionIds)]};}
export function registerTaster(t:Taster,sessionId:string):boolean{return t.status==='approved'&&t.approvedSessionIds.includes(sessionId);}
export function convertTaster(t:Taster):Taster{if(t.status!=='attended'&&t.status!=='approved')throw new Error('taster must be approved or attended');return {...t,status:'converted'};}
export type WaitlistEntry={memberId:string;position:number};
export function promoteNextWaitlisted(entries:WaitlistEntry[],capacity:number,active:number):WaitlistEntry|null{if(active>=capacity)return null;return [...entries].sort((a,b)=>a.position-b.position)[0]??null;}
