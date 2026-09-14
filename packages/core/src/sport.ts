/* SportProfile seeds — multi-sport by config, not code (rule 2). */
import type { SportProfile } from './domain.js';

export const TABLE_TENNIS_PROFILE: SportProfile = {
  id: 'sport-table-tennis',
  name: 'Table Tennis',
  feedbackAttributeTemplates: {
    skill: ['forehand', 'backhand', 'serve', 'footwork', 'receiving'],
    focus: ['concentration', 'composure under pressure'],
    behaviour: ['discipline', 'sportsmanship', 'coachability', 'communication/team attitude'],
    progression: ['improvement vs previous', 'consistency', 'response to training', 'goal achievement'],
  },
  rankSystem: { type: 'band', levels: ['Beginner', 'Foundation', 'Intermediate', 'Advanced', 'Elite'] },
  playingStyles: ['Attacker', 'All-round', 'Defender/Chopper', 'Pips-out hitter', 'Left-hand looper', 'Custom'],
  presetChips: [
    { phrase: 'Great footwork today — kept balance through long rallies.', suggestedRatings: { 'skill:footwork': 8 } },
    { phrase: 'Serve needs variation — work on side-spin placement.', suggestedRatings: { 'skill:serve': 5 } },
    { phrase: 'Composed under pressure in the deciding game.', suggestedRatings: { 'focus:composure under pressure': 8 } },
    { phrase: 'Excellent sportsmanship and coachability.', suggestedRatings: { 'behaviour:sportsmanship': 9, 'behaviour:coachability': 9 } },
  ],
  equipmentGuide:
    'Welcome to Kingfisher TTC! You need: a table-tennis racket (all-round blade to start), ' +
    'non-marking indoor court shoes, comfortable sportswear, and a water bottle. ' +
    'We will help you register with Table Tennis England (TTE) when you are ready to compete.',
  sessionTypeTemplates: ['Group coaching', '1-2-1', 'Open practice', 'Squad training', 'Holiday camp'],
  groupTemplates: ['Beginners', 'Intermediates', 'Squad', 'Adults'],
};

export function resolveLevels(profile: SportProfile): string[] {
  return profile.rankSystem?.levels ?? [];
}
export function resolveFeedbackAttributes(profile: SportProfile): [string, string[]][] {
  return Object.entries(profile.feedbackAttributeTemplates);
}
export function isKnownStyle(profile: SportProfile, style: string): boolean {
  return (profile.playingStyles ?? []).includes(style);
}
