export type TagScope = 'member' | 'coach' | 'sparrer' | 'program' | 'program_template' | 'session';
export type TagKind = 'skill_level' | 'performance_stream' | 'membership' | 'coach_focus' | 'sparring_focus' | 'custom';

export interface TagOption {
  code: string;
  label: string;
  sortOrder?: number;
}

export interface TagTypeDefinition {
  scope: TagScope;
  code: string;
  label: string;
  kind: TagKind;
  allowMultiple: boolean;
  options: TagOption[];
}

export const DEFAULT_TAG_SEED: Record<string, Record<string, TagOption[]>> = {
  member: {
    skill_level: [
      { code: '1', label: 'Absolute Novice' },
      { code: '2', label: 'Beginner' },
      { code: '3', label: 'Advanced Beginner' },
      { code: '4', label: 'Intermediate-Novice' },
      { code: '5', label: 'Intermediate' },
      { code: '6', label: 'Advanced Intermediate' },
      { code: '7', label: 'Pre-Advanced' },
      { code: '8', label: 'Advanced' },
      { code: '9', label: 'Elite Junior' },
      { code: '10', label: 'Pre-Professional / Mastery' },
    ],
    performance_stream: [
      { code: 'under_9', label: 'Under 9' },
      { code: 'under_11', label: 'Under 11' },
      { code: 'u13', label: 'U13' },
      { code: 'u15', label: 'U15' },
      { code: 'u17', label: 'U17' },
      { code: 'u19', label: 'U19' },
    ],
    membership: [
      { code: 'standard', label: 'Standard' },
      { code: 'gold', label: 'Gold' },
      { code: 'scholarship', label: 'Scholarship' },
      { code: 'trial', label: 'Trial' },
    ],
  },
  coach: {
    coach_focus: [
      { code: 'performance', label: 'Performance' },
      { code: 'development', label: 'Development' },
      { code: 'beginners', label: 'Beginners' },
    ],
  },
  sparrer: {
    sparring_focus: [
      { code: 'performance', label: 'Performance' },
      { code: 'development', label: 'Development' },
      { code: 'beginners', label: 'Beginners' },
    ],
  },
};

export const TAG_TYPE_DEFINITIONS: TagTypeDefinition[] = [
  { scope: 'member', code: 'skill_level', label: 'Skill level', kind: 'skill_level', allowMultiple: false, options: DEFAULT_TAG_SEED.member.skill_level },
  { scope: 'member', code: 'performance_stream', label: 'Performance stream', kind: 'performance_stream', allowMultiple: true, options: DEFAULT_TAG_SEED.member.performance_stream },
  { scope: 'member', code: 'membership', label: 'Membership', kind: 'membership', allowMultiple: true, options: DEFAULT_TAG_SEED.member.membership },
  { scope: 'coach', code: 'coach_focus', label: 'Coaching focus', kind: 'coach_focus', allowMultiple: true, options: DEFAULT_TAG_SEED.coach.coach_focus },
  { scope: 'sparrer', code: 'sparring_focus', label: 'Sparring focus', kind: 'sparring_focus', allowMultiple: true, options: DEFAULT_TAG_SEED.sparrer.sparring_focus },
];

export function resolveTagOptions(scope: TagScope, code: string): TagOption[] {
  const def = TAG_TYPE_DEFINITIONS.find((entry) => entry.scope === scope && entry.code === code);
  return def ? def.options : [];
}

export function buildSkillLevelLabel(code: string): string {
  const option = DEFAULT_TAG_SEED.member.skill_level.find((entry) => entry.code === String(code));
  return option?.label ?? 'Unspecified';
}
