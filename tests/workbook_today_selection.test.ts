import { describe, expect, it } from 'vitest';
import { getPreferredGroupKey, getPreferredSessionIndex, resolveGroupMemberIds } from '../apps/web/src/pages/ops';

describe('workbook today selection', () => {
  it('prefers the group that has the next available session today', () => {
    const now = new Date('2026-09-10T15:00:00Z');

    const groups = [
      {
        key: 'older-group',
        sessions: [
          { id: 'old-1', start_at: '2026-09-09T18:00:00Z', end_at: '2026-09-09T19:00:00Z' },
          { id: 'old-2', start_at: '2026-09-09T19:00:00Z', end_at: '2026-09-09T20:00:00Z' },
        ],
      },
      {
        key: 'today-group',
        sessions: [
          { id: 'today-1', start_at: '2026-09-10T17:00:00Z', end_at: '2026-09-10T18:00:00Z' },
          { id: 'today-2', start_at: '2026-09-10T19:00:00Z', end_at: '2026-09-10T20:00:00Z' },
        ],
      },
      {
        key: 'future-group',
        sessions: [
          { id: 'future-1', start_at: '2026-09-11T18:00:00Z', end_at: '2026-09-11T19:00:00Z' },
        ],
      },
    ] as any;

    expect(getPreferredGroupKey(groups, now)).toBe('today-group');
  });

  it('selects the next session within the same day when today has multiple slots', () => {
    const now = new Date('2026-09-10T15:30:00Z');
    const group = {
      key: 'today-group',
      sessions: [
        { id: 'a', start_at: '2026-09-10T16:00:00Z', end_at: '2026-09-10T17:00:00Z' },
        { id: 'b', start_at: '2026-09-10T18:00:00Z', end_at: '2026-09-10T19:00:00Z' },
        { id: 'c', start_at: '2026-09-10T14:00:00Z', end_at: '2026-09-10T15:00:00Z' },
      ],
    } as any;

    expect(getPreferredSessionIndex(group, now)).toBe(0);
  });

  it('includes template-backed members even when flat enrollment rows are empty', () => {
    const group = {
      key: 'weekly-series',
      sessions: [
        { id: 's1', template_id: 'tpl-1', start_at: '2026-09-10T18:00:00Z', end_at: '2026-09-10T19:00:00Z' },
        { id: 's2', template_id: 'tpl-1', start_at: '2026-09-17T18:00:00Z', end_at: '2026-09-17T19:00:00Z' },
      ],
    } as any;

    const templateMembers = [
      { template_id: 'tpl-1', member_id: 'm-1' },
      { template_id: 'tpl-1', member_id: 'm-2' },
    ];

    const sessionEnrollments = [
      { session_id: 's2', member_id: 'm-3' },
    ];

    expect(resolveGroupMemberIds(group, templateMembers, sessionEnrollments)).toEqual(['m-1', 'm-2', 'm-3']);
  });

  it('excludes members whose validity window is not active on the session date', () => {
    const group = {
      key: 'windowed-series',
      sessions: [
        { id: 's1', template_id: 'tpl-1', start_at: '2026-09-10T18:00:00Z', end_at: '2026-09-10T19:00:00Z' },
        { id: 's2', template_id: 'tpl-1', start_at: '2026-09-17T18:00:00Z', end_at: '2026-09-17T19:00:00Z' },
      ],
    } as any;

    const templateMembers = [
      { template_id: 'tpl-1', member_id: 'm-1', valid_from: '2026-09-01', valid_to: '2026-09-09' },
      { template_id: 'tpl-1', member_id: 'm-2', valid_from: '2026-09-01', valid_to: '2026-09-30' },
    ];

    const sessionEnrollments = [
      { session_id: 's1', member_id: 'm-3', valid_from: '2026-09-10', valid_to: '2026-09-10' },
      { session_id: 's2', member_id: 'm-4', valid_from: '2026-09-18', valid_to: '2026-09-18' },
    ];

    expect(resolveGroupMemberIds(group, templateMembers, sessionEnrollments)).toEqual(['m-2', 'm-3']);
  });
});
