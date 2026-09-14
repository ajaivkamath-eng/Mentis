import type { GeneratedInstance } from './generator.js';
export type ScheduleOverride = { id:string; from:string; to:string; venueId?:string; start?:string; end?:string; staff?:GeneratedInstance['staff'] };
export type OverriddenInstance = GeneratedInstance & { overridden:boolean; original:GeneratedInstance };
export function applyOverrides(instance:GeneratedInstance, overrides:ScheduleOverride[]):OverriddenInstance {
  const applicable=overrides.filter(o=>o.from<=instance.start && o.to>=instance.end).sort((a,b)=>a.id.localeCompare(b.id));
  const original={...instance,staff:instance.staff.map(s=>({...s}))};
  if(!applicable.length) return {...instance,overridden:false,original};
  const result={...instance};
  for(const o of applicable){ if(o.venueId) result.venueId=o.venueId; if(o.start) result.start=o.start; if(o.end) result.end=o.end; if(o.staff) result.staff=o.staff; }
  return {...result,overridden:true,original};
}
