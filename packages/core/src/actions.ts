export type ActionStatus='open'|'breached'|'closed';
export type Action={id:string;dueAt:string;breachAt?:string;status:ActionStatus};
export function evaluateAction(action:Action,now:string):Action {if(action.status==='closed')return action; if(action.breachAt&&Date.parse(now)>=Date.parse(action.breachAt))return {...action,status:'breached'}; return action;}
export function closeAction(action:Action):Action {if(action.status==='closed')return action;return {...action,status:'closed'};}
export function actionTimeline(sessionStart:string,dueOffsetMs:number,breachOffsetMs:number){const start=Date.parse(sessionStart);return {dueAt:new Date(start-dueOffsetMs).toISOString(),breachAt:new Date(start-breachOffsetMs).toISOString()};}
