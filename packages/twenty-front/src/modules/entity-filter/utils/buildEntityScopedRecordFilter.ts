import { type RecordGqlOperationFilter } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

type EntityFilterBuilder = (entityId: string) => RecordGqlOperationFilter;

const DEFAULT_ENTITY_FILTER_MAP: Record<string, EntityFilterBuilder> = {
  company: (entityId) => ({ internalEntitiesId: { in: [entityId] } }),
  companyEntityMembership: (entityId) => ({
    internalEntityId: { eq: entityId },
  }),
  internalEntity: (entityId) => ({ id: { eq: entityId } }),
  opportunity: (entityId) => ({ internalEntityId: { eq: entityId } }),
  person: (entityId) => ({ internalEntitiesId: { in: [entityId] } }),
  personEntityMembership: (entityId) => ({
    internalEntityId: { eq: entityId },
  }),
};

const entityFilterRegistry = new Map<string, EntityFilterBuilder>(
  Object.entries(DEFAULT_ENTITY_FILTER_MAP),
);

export const registerEntityFilterBuilder = (
  objectNameSingular: string,
  builder: EntityFilterBuilder,
): void => {
  entityFilterRegistry.set(objectNameSingular, builder);
};

export const resetEntityFilterBuilders = (): void => {
  entityFilterRegistry.clear();
  Object.entries(DEFAULT_ENTITY_FILTER_MAP).forEach(([key, value]) => {
    entityFilterRegistry.set(key, value);
  });
};

/**
 * Vrai si `buildEntityScopedRecordFilter` fait varier sa sortie avec l'entité
 * active pour cet objet. Utilisé par `useFindManyRecords` : quand c'est faux,
 * les variables de la requête Apollo ne changent pas au bascule d'entité, donc
 * le cache ne se rafraîchit pas tout seul — même si le SERVEUR, lui, applique
 * bien un scope différent via l'en-tête HTTP (ex. `note`, dont la visibilité
 * d'équipe est décidée côté serveur et ne peut pas se traduire en filtre
 * GraphQL côté client).
 */
export const isEntityFilterRegisteredForObject = (
  objectNameSingular: string,
): boolean => entityFilterRegistry.has(objectNameSingular);

const isEmptyRecordFilter = (
  filter: RecordGqlOperationFilter | undefined,
): boolean => !isDefined(filter) || Object.keys(filter).length === 0;

export const buildEntityScopedRecordFilter = ({
  objectNameSingular,
  filter,
  selectedEntityId,
}: {
  objectNameSingular: string;
  filter?: RecordGqlOperationFilter;
  selectedEntityId: string | null;
}): RecordGqlOperationFilter | undefined => {
  const normalizedFilter = isEmptyRecordFilter(filter) ? undefined : filter;

  if (!isDefined(selectedEntityId) || selectedEntityId.length === 0) {
    return normalizedFilter;
  }

  const buildEntityFilter = entityFilterRegistry.get(objectNameSingular);

  if (!isDefined(buildEntityFilter)) {
    return normalizedFilter;
  }

  const entityFilter = buildEntityFilter(selectedEntityId);

  return isDefined(normalizedFilter)
    ? { and: [normalizedFilter, entityFilter] }
    : entityFilter;
};
