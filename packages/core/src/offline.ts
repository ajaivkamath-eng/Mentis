import type { AttendanceRecord, AttendanceStatus } from './domain.js';
export type SyncOperation={id:string; record:AttendanceRecord; queuedAt:string};
export type RegisterState={records:Record<string,AttendanceRecord>; queue:SyncOperation[]; undo:AttendanceRecord[]};
export function createRegister(records:AttendanceRecord[]=[]):RegisterState{return {records:Object.fromEntries(records.map(r=>[r.id,r])),queue:[],undo:[]};}
export function cycleAttendance(state:RegisterState,id:string,now=new Date().toISOString()):RegisterState{
 const current=state.records[id]; if(!current) throw new Error('attendance record not found');
 const next:AttendanceStatus=current.status==='present'?'absent':current.status==='absent'?'present':'present';
 const updated={...current,status:next,recordedAt:now,offline:true};
 return {...state,records:{...state.records,[id]:updated},queue:[...state.queue,{id:`sync-${id}-${now}`,record:updated,queuedAt:now}],undo:[...state.undo,current]};
}
export function markAllPresent(state:RegisterState,ids:string[],now=new Date().toISOString()):RegisterState { let next=state; for(const id of ids){if(next.records[id]?.status!=='present') next=cycleAttendance(next,id,now); } return next; }
export function undoLast(state:RegisterState):RegisterState { const previous=state.undo.at(-1); if(!previous)return state; const current=state.records[previous.id]; return {...state,records:{...state.records,[previous.id]:previous},undo:state.undo.slice(0,-1),queue:[...state.queue,{id:`undo-${previous.id}-${Date.now()}`,record:previous,queuedAt:new Date().toISOString()}]}; }
export function mergeAttendance(local:AttendanceRecord,remote:AttendanceRecord):AttendanceRecord{return Date.parse(local.recordedAt)>=Date.parse(remote.recordedAt)?local:remote;}
export function drainQueue(state:RegisterState,ackedIds:string[]):RegisterState{return {...state,queue:state.queue.filter(op=>!ackedIds.includes(op.id))};}
