import { shouldResetPersistedEntityFilter } from '@/entity-filter/utils/shouldResetPersistedEntityFilter';

describe('shouldResetPersistedEntityFilter', () => {
  it('resets when the persisted entity is no longer selectable', () => {
    expect(
      shouldResetPersistedEntityFilter({
        selectedEntityId: 'entity-gone',
        selectableEntityIds: ['entity-a', 'entity-b'],
        isLoading: false,
      }),
    ).toBe(true);
  });

  it('keeps a still-selectable persisted entity', () => {
    expect(
      shouldResetPersistedEntityFilter({
        selectedEntityId: 'entity-a',
        selectableEntityIds: ['entity-a', 'entity-b'],
        isLoading: false,
      }),
    ).toBe(false);
  });

  it('never resets while the selectable entities are still loading', () => {
    expect(
      shouldResetPersistedEntityFilter({
        selectedEntityId: 'entity-gone',
        selectableEntityIds: [],
        isLoading: true,
      }),
    ).toBe(false);
  });

  it('does not reset the group view (null selection)', () => {
    expect(
      shouldResetPersistedEntityFilter({
        selectedEntityId: null,
        selectableEntityIds: ['entity-a'],
        isLoading: false,
      }),
    ).toBe(false);
  });

  it('does not reset an empty-string selection (treated as group view)', () => {
    expect(
      shouldResetPersistedEntityFilter({
        selectedEntityId: '',
        selectableEntityIds: ['entity-a'],
        isLoading: false,
      }),
    ).toBe(false);
  });
});
