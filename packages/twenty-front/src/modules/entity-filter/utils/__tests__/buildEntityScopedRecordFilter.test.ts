import { buildEntityScopedRecordFilter } from '@/entity-filter/utils/buildEntityScopedRecordFilter';
import { buildInternalEntity } from '@/entity-filter/utils/__tests__/factories/internal-entity.factory';

describe('buildEntityScopedRecordFilter', () => {
  const internalEntity = buildInternalEntity();

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
        selectedEntityId: internalEntity.id,
      }),
    ).toEqual({ internalEntityId: { eq: internalEntity.id } });
  });

  it('scopes people and companies through their internal entity memberships', () => {
    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'person',
        selectedEntityId: internalEntity.id,
      }),
    ).toEqual({ internalEntitiesId: { in: [internalEntity.id] } });

    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'company',
        selectedEntityId: internalEntity.id,
      }),
    ).toEqual({ internalEntitiesId: { in: [internalEntity.id] } });
  });

  it('combines an existing filter with the entity filter', () => {
    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'opportunity',
        filter: { deletedAt: { is: 'NULL' } },
        selectedEntityId: internalEntity.id,
      }),
    ).toEqual({
      and: [
        { deletedAt: { is: 'NULL' } },
        { internalEntityId: { eq: internalEntity.id } },
      ],
    });
  });

  it('does not combine empty filters with the entity filter', () => {
    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'company',
        filter: {},
        selectedEntityId: internalEntity.id,
      }),
    ).toEqual({ internalEntitiesId: { in: [internalEntity.id] } });
  });

  it('does not scope unrelated objects', () => {
    const filter = { id: { eq: 'record-id' } };

    expect(
      buildEntityScopedRecordFilter({
        objectNameSingular: 'task',
        filter,
        selectedEntityId: internalEntity.id,
      }),
    ).toBe(filter);
  });
});
