import { describe, expect, it } from 'vitest';
import { resolveSelectedGroupsForPreview } from '../apps/web/src/pages/ops.tsx';

describe('resolveSelectedGroupsForPreview', () => {
  const groups = [
    { key: 'reading-1', name: 'Reading School A', venue_id: 'v-reading', venue_name: 'Reading School', timeLabel: 'Mon 18:00', sessions: [] },
    { key: 'gl-1', name: 'Group Lens', venue_id: 'v-glasgow', venue_name: 'Glasgow', timeLabel: 'Tue 18:00', sessions: [] },
    { key: 'reading-2', name: 'Reading School B', venue_id: 'v-reading', venue_name: 'Reading School', timeLabel: 'Wed 18:00', sessions: [] },
  ] as any;

  it('prefers the active group over stale bulk selections when the user switches to a single reading-school sheet', () => {
    const result = resolveSelectedGroupsForPreview({
      groups,
      selectedGroupKeys: ['gl-1'],
      selectedGroupKey: 'reading-1',
      selectedVenue: 'all',
      filteredGroups: groups,
      selectedGroup: groups[0],
    });

    expect(result.map((group: any) => group.key)).toEqual(['reading-1']);
  });

  it('keeps the venue-scoped list when there is no explicit active group', () => {
    const result = resolveSelectedGroupsForPreview({
      groups,
      selectedGroupKeys: [],
      selectedGroupKey: '',
      selectedVenue: 'v-reading',
      filteredGroups: [groups[0], groups[2]],
      selectedGroup: null,
    });

    expect(result.map((group: any) => group.key)).toEqual(['reading-1', 'reading-2']);
  });
});
