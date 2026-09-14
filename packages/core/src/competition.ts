/* Competition diary, matches, rankings, PlayerFeedback (rules 13–14, 29). */
import type { EventSource, MatchRecord, MemberGoal } from './domain.js';

export type Feedback = {
  memberId: string; sourceType: 'session' | 'event'; sourceId: string;
  ratings: Record<string, number>; text: string;
  subSourceId?: string; subSourceKind?: 'segment' | 'subEvent' | 'match';
  performedWithStaff?: string[]; performedWithPlayers?: string[]; tags?: string[];
  coachId?: string;
};
export function validateFeedback(f: Feedback): string[] {
  const errors: string[] = [];
  if (!f.sourceId) errors.push('feedback source is required');
  for (const [attribute, score] of Object.entries(f.ratings)) {
    if (!Number.isInteger(score) || score < 1 || score > 10)
      errors.push(`${attribute} rating must be an integer from 1 to 10`);
  }
  return errors;
}
export function appendPreset(text: string, phrase: string): string {
  return text ? `${text}\n${phrase}` : phrase;
}
export function ratingTrend(series: { at: string; score: number }[]): 'up' | 'down' | 'flat' {
  if (series.length < 2) return 'flat';
  const sorted = [...series].sort((a, b) => a.at.localeCompare(b.at));
  const first = sorted[0].score;
  const last = sorted[sorted.length - 1].score;
  return last > first ? 'up' : last < first ? 'down' : 'flat';
}

export type Ranking = {
  source: string; value: number; asOfDate: string;
  memberId?: string; sourceRef?: string;
};
/** Lower value = better rank. Derived from consecutive snapshots per platform. */
export function rankMovement(history: Ranking[]): 'up' | 'down' | 'same' | 'unknown' {
  if (history.length < 2) return 'unknown';
  const sorted = [...history].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const previous = sorted.at(-2)!.value;
  const current = sorted.at(-1)!.value;
  return current < previous ? 'up' : current > previous ? 'down' : 'same';
}

export type SquadCandidate = { memberId: string; age: number; rank: number };
/** Rule 29 — suggestions from DOB age band + rank band; coach confirms (never auto-enter). */
export function eligibleSquad(
  candidates: SquadCandidate[], ageMin: number, ageMax: number, rankMin: number, rankMax: number,
): SquadCandidate[] {
  return candidates.filter((c) => c.age >= ageMin && c.age <= ageMax && c.rank >= rankMin && c.rank <= rankMax);
}

export function validateMatch(m: MatchRecord): string[] {
  const errors: string[] = [];
  if (!m.opponent?.trim()) errors.push('opponent is required');
  if (m.gamesFor.length !== m.gamesAgainst.length) errors.push('per-game scores must pair up');
  if (!m.eventId && !m.subEventId && !m.sessionId) errors.push('match context (event, sub-event or session) is required');
  return errors;
}
export function matchForm(matches: MatchRecord[], last = 5): ('W' | 'L' | 'D')[] {
  return [...matches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, last).map((m) => m.result);
}
export function winLoss(matches: MatchRecord[]): { wins: number; losses: number; draws: number } {
  const out = { wins: 0, losses: 0, draws: 0 };
  for (const m of matches) {
    if (m.result === 'W') out.wins += 1;
    else if (m.result === 'L') out.losses += 1;
    else out.draws += 1;
  }
  return out;
}

export function goalDue(goal: MemberGoal, at = new Date().toISOString().slice(0, 10)): boolean {
  return goal.status === 'inProgress' && !!goal.targetDate && goal.targetDate <= at;
}

export type DiaryImportRow = {
  name: string; startsOn: string; endsOn: string; location?: string;
  source: EventSource; externalRef?: string;
};
/** Source-agnostic diary import layer (manual + CSV now; scraper/API later). */
export function validateDiaryImport(rows: DiaryImportRow[]): { valid: DiaryImportRow[]; errors: string[] } {
  const valid: DiaryImportRow[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    if (!r.name?.trim()) errors.push(`row ${i + 1}: name is required`);
    else if (!r.startsOn || !r.endsOn || r.endsOn < r.startsOn) errors.push(`row ${i + 1}: invalid date range`);
    else valid.push(r);
  });
  return { valid, errors };
}
