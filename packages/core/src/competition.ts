export type Feedback={memberId:string;sourceType:'session'|'event';sourceId:string;ratings:Record<string,number>;text:string};
export function validateFeedback(f:Feedback):string[]{const errors:string[]=[];if(!f.sourceId)errors.push('feedback source is required');for(const [attribute,score] of Object.entries(f.ratings)){if(!Number.isInteger(score)||score<1||score>10)errors.push(`${attribute} rating must be an integer from 1 to 10`);}return errors;}
export type Ranking={source:string;value:number;asOfDate:string};
export function rankMovement(history:Ranking[]):'up'|'down'|'same'|'unknown'{if(history.length<2)return 'unknown';const sorted=[...history].sort((a,b)=>a.asOfDate.localeCompare(b.asOfDate));const previous=sorted.at(-2)!.value;const current=sorted.at(-1)!.value;return current<previous?'up':current>previous?'down':'same';}
export type SquadCandidate={memberId:string;age:number;rank:number};
export function eligibleSquad(candidates:SquadCandidate[],ageMin:number,ageMax:number,rankMin:number,rankMax:number):SquadCandidate[]{return candidates.filter(c=>c.age>=ageMin&&c.age<=ageMax&&c.rank>=rankMin&&c.rank<=rankMax);}
