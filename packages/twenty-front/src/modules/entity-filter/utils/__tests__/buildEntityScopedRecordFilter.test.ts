import { buildEntityScopedRecordFilter } from '@/entity-filter/utils/buildEntityScopedRecordFilter';

const ENTITY_ID = '20202020-0000-4000-8000-000000000001';

describe('buildEntityScopedRecordFilter', () => {
  it('keeps the original filter in group view', () => {
    const filter = { name: { ilike: '%acme%' } };

    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'company',
        filter,
        selectedEntityId: null,
      }),
    ).toBe(filter);
  });

  it('normalizes empty filters in group view', () => {
    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'company',
        filter: {},
        selectedEntityId: null,
      }),
    ).toBeUndefined();
  });

  it('scopes opportunities through internalEntityId', () => {
    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'opportunity',
        selectedEntityId: ENTITY_ID,
      }),
    ).toEqual({ internalEntityId: { eq: ENTITY_ID } });
  });

  it('scopes people and companies through their internal entity memberships', () => {
    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'person',
        selectedEntityId: ENTITY_ID,
      }),
    ).toEqual({ internalEntitiesId: { in: [ENTITY_ID] } });

    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'company',
        selectedEntityId: ENTITY_ID,
      }),
    ).toEqual({ internalEntitiesId: { in: [ENTITY_ID] } });
  });

  it('combines an existing filter with the entity filter', () => {
    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'opportunity',
        filter: { deletedAt: { is: 'NULL' } },
        selectedEntityId: ENTITY_ID,
      }),
    ).toEqual({
      and: [
        { deletedAt: { is: 'NULL' } },
        { internalEntityId: { eq: ENTITY_ID } },
      ],
    });
  });

  it('does not combine empty filters with the entity filter', () => {
    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'company',
        filter: {},
        selectedEntityId: ENTITY_ID,
      }),
    ).toEqual({ internalEntitiesId: { in: [ENTITY_ID] } });
  });

  it('does not scope unrelated objects', () => {
    const filter = { id: { eq: 'record-id' } };

    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'task',
        filter,
        selectedEntityId: ENTITY_ID,
      }),
    ).toBe(filter);
  });
});
