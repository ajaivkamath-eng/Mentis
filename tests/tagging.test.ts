import { describe, it, expect } from 'vitest';
import { DEFAULT_TAG_SEED, resolveTagOptions, buildSkillLevelLabel } from '@mentis/core';

describe('tagging taxonomy', () => {
  it('includes the default junior skill levels and performance streams', () => {
    const skillLevels = DEFAULT_TAG_SEED.member.skill_level;
    const performance = DEFAULT_TAG_SEED.member.performance_stream;

    expect(skillLevels[0]).toMatchObject({ code: '1', label: 'Absolute Novice' });
    expect(skillLevels.at(-1)).toMatchObject({ code: '10', label: 'Pre-Professional / Mastery' });
    expect(performance.map((option) => option.code)).toEqual(['under_9', 'under_11', 'u13', 'u15', 'u17', 'u19']);
  });

  it('resolves options by scope and code and exposes a readable skill label', () => {
    const options = resolveTagOptions('member', 'skill_level');
    expect(options.length).toBeGreaterThan(0);
    expect(buildSkillLevelLabel('5')).toBe('Intermediate');
  });
});
