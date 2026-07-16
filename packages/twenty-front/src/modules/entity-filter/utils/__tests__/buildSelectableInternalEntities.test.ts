import {
  type SelectableInternalEntityMembership,
  buildSelectableInternalEntities,
} from '@/entity-filter/utils/buildSelectableInternalEntities';
import { MAIN_COLORS_LIGHT } from 'twenty-ui/theme';

const buildMembership = (
  overrides: Partial<SelectableInternalEntityMembership> = {},
): SelectableInternalEntityMembership => ({
  internalEntityId: 'entity-1',
  internalEntity: {
    id: 'entity-1',
    name: 'WEKNOW',
    color: MAIN_COLORS_LIGHT.green,
  },
  ...overrides,
});

describe('buildSelectableInternalEntities', () => {
  it('deduplicates memberships by entity id and sorts them by name', () => {
    const result = buildSelectableInternalEntities({
      currentUserEntityId: null,
      fallbackEntityLabel: 'Ma société',
      memberships: [
        buildMembership({
          internalEntityId: 'entity-2',
          internalEntity: {
            id: 'entity-2',
            name: 'WEKNOW',
            color: MAIN_COLORS_LIGHT.blue,
          },
        }),
        buildMembership({
          internalEntityId: 'entity-1',
          internalEntity: {
            id: 'entity-1',
            name: 'ALLSENSIA',
            color: MAIN_COLORS_LIGHT.orange,
          },
        }),
        buildMembership({
          internalEntityId: 'entity-1',
          internalEntity: {
            id: 'entity-1',
            name: 'ALLSENSIA',
            color: MAIN_COLORS_LIGHT.orange,
          },
        }),
      ],
    });

    expect(result).toEqual([
      { id: 'entity-1', name: 'ALLSENSIA', color: MAIN_COLORS_LIGHT.orange },
      { id: 'entity-2', name: 'WEKNOW', color: MAIN_COLORS_LIGHT.blue },
    ]);
  });

  it('keeps the current user entity as a fallback when memberships are missing', () => {
    const result = buildSelectableInternalEntities({
      currentUserEntityId: 'entity-current',
      fallbackEntityLabel: 'Ma société',
      memberships: [],
    });

    expect(result).toEqual([
      { id: 'entity-current', name: 'Ma société', color: null },
    ]);
  });

  it('falls back to the join column when nested entity details are incomplete', () => {
    const result = buildSelectableInternalEntities({
      currentUserEntityId: null,
      fallbackEntityLabel: 'Ma société',
      memberships: [
        buildMembership({
          internalEntityId: 'entity-1',
          internalEntity: {
            name: '',
            color: null,
          },
        }),
      ],
    });

    expect(result).toEqual([
      { id: 'entity-1', name: 'Ma société', color: null },
    ]);
  });

  it('keeps the richest entity details when duplicated memberships are incomplete', () => {
    const result = buildSelectableInternalEntities({
      currentUserEntityId: null,
      fallbackEntityLabel: 'Ma société',
      memberships: [
        buildMembership({
          internalEntityId: 'entity-1',
          internalEntity: {
            id: 'entity-1',
            name: 'WEKNOW',
            color: MAIN_COLORS_LIGHT.green,
          },
        }),
        buildMembership({
          internalEntityId: 'entity-1',
          internalEntity: {
            id: 'entity-1',
            name: '',
            color: null,
          },
        }),
      ],
    });

    expect(result).toEqual([
      { id: 'entity-1', name: 'WEKNOW', color: MAIN_COLORS_LIGHT.green },
    ]);
  });
});
