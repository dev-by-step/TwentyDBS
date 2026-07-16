import { isDefined } from 'twenty-shared/utils';

export type SelectableInternalEntity = {
  id: string;
  name: string;
  color: string | null;
};

export type SelectableInternalEntityMembership = {
  internalEntityId: string | null;
  internalEntity?: {
    id?: string | null;
    name?: string | null;
    color?: string | null;
  } | null;
};

const isNonEmptyValue = (value: string | null | undefined): value is string =>
  isDefined(value) && value.trim().length > 0;

const buildEntityName = ({
  name,
  fallbackEntityLabel,
}: {
  name: string | null | undefined;
  fallbackEntityLabel: string;
}) => (isNonEmptyValue(name) ? name.trim() : fallbackEntityLabel);

const mergeSelectableInternalEntity = ({
  currentEntity,
  fallbackEntityLabel,
  nextEntity,
}: {
  currentEntity: SelectableInternalEntity | undefined;
  fallbackEntityLabel: string;
  nextEntity: SelectableInternalEntity;
}): SelectableInternalEntity => {
  if (!isDefined(currentEntity)) {
    return nextEntity;
  }

  return {
    id: nextEntity.id,
    name:
      nextEntity.name === fallbackEntityLabel
        ? currentEntity.name
        : nextEntity.name,
    color: nextEntity.color ?? currentEntity.color,
  };
};

export const buildSelectableInternalEntities = ({
  currentUserEntityId,
  fallbackEntityLabel,
  memberships,
}: {
  currentUserEntityId: string | null;
  fallbackEntityLabel: string;
  memberships: SelectableInternalEntityMembership[];
}): SelectableInternalEntity[] => {
  const entitiesById = new Map<string, SelectableInternalEntity>();

  for (const membership of memberships) {
    const entityId = isNonEmptyValue(membership.internalEntity?.id)
      ? membership.internalEntity.id
      : membership.internalEntityId;

    if (!isNonEmptyValue(entityId)) {
      continue;
    }

    const nextEntity = {
      id: entityId,
      name: buildEntityName({
        name: membership.internalEntity?.name,
        fallbackEntityLabel,
      }),
      color: membership.internalEntity?.color ?? null,
    };

    entitiesById.set(
      entityId,
      mergeSelectableInternalEntity({
        currentEntity: entitiesById.get(entityId),
        fallbackEntityLabel,
        nextEntity,
      }),
    );
  }

  if (
    isNonEmptyValue(currentUserEntityId) &&
    !entitiesById.has(currentUserEntityId)
  ) {
    entitiesById.set(currentUserEntityId, {
      id: currentUserEntityId,
      name: fallbackEntityLabel,
      color: null,
    });
  }

  return [...entitiesById.values()].sort((firstEntity, secondEntity) => {
    const nameComparison = firstEntity.name.localeCompare(secondEntity.name);

    return nameComparison === 0
      ? firstEntity.id.localeCompare(secondEntity.id)
      : nameComparison;
  });
};
