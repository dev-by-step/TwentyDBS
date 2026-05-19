import {
  buildEditInitialFormState,
  deriveAudienceModeFromSharingScope,
  deriveSharingScopeFromAudienceMode,
  mergeEntityIds,
} from '@/activities/group-calendar/utils/groupCalendarFormUtils';

describe('groupCalendarFormUtils', () => {
  describe('mergeEntityIds', () => {
    it('dedupes ids while preserving event-entity precedence', () => {
      expect(mergeEntityIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('returns an empty array when both inputs are empty', () => {
      expect(mergeEntityIds([], [])).toEqual([]);
    });

    it('keeps event entities even if audience inputs are empty', () => {
      expect(mergeEntityIds(['a'], [])).toEqual(['a']);
    });
  });

  describe('deriveAudienceModeFromSharingScope', () => {
    it('maps WORKSPACE_PUBLIC to group', () => {
      expect(deriveAudienceModeFromSharingScope('WORKSPACE_PUBLIC')).toBe(
        'group',
      );
    });

    it('maps ENTITY_ONLY to specific', () => {
      expect(deriveAudienceModeFromSharingScope('ENTITY_ONLY')).toBe('specific');
    });

    it('falls back to specific for null or unknown scopes', () => {
      expect(deriveAudienceModeFromSharingScope(null)).toBe('specific');
      expect(deriveAudienceModeFromSharingScope(undefined)).toBe('specific');
      expect(deriveAudienceModeFromSharingScope('UNKNOWN')).toBe('specific');
    });
  });

  describe('deriveSharingScopeFromAudienceMode', () => {
    it('keeps WORKSPACE_PUBLIC for group mode', () => {
      expect(
        deriveSharingScopeFromAudienceMode({
          audienceMode: 'group',
          isAudienceFeatureAvailable: true,
        }),
      ).toBe('WORKSPACE_PUBLIC');
    });

    it('returns ENTITY_ONLY for specific mode when audience feature available', () => {
      expect(
        deriveSharingScopeFromAudienceMode({
          audienceMode: 'specific',
          isAudienceFeatureAvailable: true,
        }),
      ).toBe('ENTITY_ONLY');
    });

    it('falls back to WORKSPACE_PUBLIC when audience feature unavailable', () => {
      expect(
        deriveSharingScopeFromAudienceMode({
          audienceMode: 'specific',
          isAudienceFeatureAvailable: false,
        }),
      ).toBe('WORKSPACE_PUBLIC');
    });
  });

  describe('buildEditInitialFormState', () => {
    const calendarEvent = {
      title: 'Sprint demo',
      startsAt: '2026-05-19T09:00:00.000Z',
      endsAt: '2026-05-19T10:00:00.000Z',
      sharingScope: 'ENTITY_ONLY',
    };

    it('splits audience entities by manageability', () => {
      const result = buildEditInitialFormState({
        calendarEvent,
        entityAudienceRows: [
          { id: 'row-1', internalEntityId: 'entity-mine' },
          { id: 'row-2', internalEntityId: 'entity-other' },
        ],
        personAudienceRows: [
          { id: 'p-1', workspaceMemberId: 'member-1' },
        ],
        manageableEventEntityIds: new Set(['entity-mine']),
      });

      expect(result.eventEntityIds).toEqual(['entity-mine']);
      expect(result.selectedAudienceEntityIds).toEqual(['entity-other']);
      expect(result.selectedAudienceMemberIds).toEqual(['member-1']);
      expect(result.audienceMode).toBe('specific');
    });

    it('maps WORKSPACE_PUBLIC sharingScope to group mode', () => {
      const result = buildEditInitialFormState({
        calendarEvent: { ...calendarEvent, sharingScope: 'WORKSPACE_PUBLIC' },
        entityAudienceRows: [],
        personAudienceRows: [],
        manageableEventEntityIds: new Set(),
      });

      expect(result.audienceMode).toBe('group');
    });

    it('keeps title defaulted to empty string when null', () => {
      const result = buildEditInitialFormState({
        calendarEvent: { ...calendarEvent, title: null },
        entityAudienceRows: [],
        personAudienceRows: [],
        manageableEventEntityIds: new Set(),
      });

      expect(result.title).toBe('');
    });
  });
});
