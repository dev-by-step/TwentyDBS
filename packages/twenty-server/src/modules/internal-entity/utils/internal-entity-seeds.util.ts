import { isDefined, isValidUuid } from 'twenty-shared/utils';

import {
  INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME,
  type InternalEntitySeed,
} from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';

type InternalEntitySeedsConfig = {
  entities: unknown;
};

// Le `#` de tête est OPTIONNEL à l'entrée : certains environnements de
// déploiement (shells cassés, config Dokku de notre VPS) tronquent toute valeur
// à partir du premier `#`, qu'ils traitent comme un début de commentaire — même
// une valeur base64-décodée. Accepter `RRGGBB` sans dièse permet donc de poser
// `INTERNAL_ENTITY_SEEDS` proprement dans ces environnements. La couleur est
// systématiquement re-normalisée en `#RRGGBB` en sortie (cf. normalizeHexColor).
const HEX_COLOR_PATTERN = /^#?[0-9A-Fa-f]{6}$/;

const normalizeHexColor = (color: string): string =>
  `#${color.replace(/^#/, '')}`.toUpperCase();

const normalizeLookupValue = (value: string): string => value.trim().toLowerCase();

const isInternalEntitySeedsConfig = (
  value: unknown,
): value is InternalEntitySeedsConfig =>
  typeof value === 'object' &&
  value !== null &&
  'entities' in value &&
  isDefined((value as InternalEntitySeedsConfig).entities);

export const cloneInternalEntitySeeds = (
  seeds: ReadonlyArray<InternalEntitySeed>,
): InternalEntitySeed[] =>
  seeds.map((seed) => ({
    ...seed,
    ...(seed.aliases ? { aliases: [...seed.aliases] } : {}),
  }));

export const validateInternalEntitySeedsOrThrow = (
  value: unknown,
): InternalEntitySeed[] => {
  const seedsCandidate = isInternalEntitySeedsConfig(value)
    ? value.entities
    : value;

  if (!Array.isArray(seedsCandidate)) {
    throw new Error(
      `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME} doit être un tableau JSON d'entités ou un objet JSON { "entities": [...] }`,
    );
  }

  if (seedsCandidate.length === 0) {
    throw new Error(
      `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME} doit contenir au moins une entité`,
    );
  }

  const seeds = seedsCandidate.map((seed, index) =>
    validateInternalEntitySeedOrThrow(seed, index),
  );
  const seenIds = new Set<string>();
  const seenLookupValues = new Set<string>();

  for (const seed of seeds) {
    if (seenIds.has(seed.id)) {
      throw new Error(
        `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME} contient un id dupliqué: ${seed.id}`,
      );
    }

    seenIds.add(seed.id);

    for (const lookupValue of buildLookupValues(seed)) {
      if (seenLookupValues.has(lookupValue)) {
        throw new Error(
          `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME} contient un nom ou alias dupliqué: ${lookupValue}`,
        );
      }

      seenLookupValues.add(lookupValue);
    }
  }

  return seeds;
};

export const resolveInternalEntitySeedId = (
  entityName: string | null,
  internalEntitySeeds: ReadonlyArray<InternalEntitySeed>,
): string | null => {
  if (!isDefined(entityName)) {
    return null;
  }

  const normalizedEntityName = normalizeLookupValue(entityName);

  if (normalizedEntityName.length === 0) {
    return null;
  }

  return (
    internalEntitySeeds.find(
      (seed) => buildLookupValues(seed).includes(normalizedEntityName),
    )?.id ?? null
  );
};

const validateInternalEntitySeedOrThrow = (
  value: unknown,
  index: number,
): InternalEntitySeed => {
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME}[${index}] doit être un objet`,
    );
  }

  const { aliases, color, id, name } = value as Partial<InternalEntitySeed>;

  if (!isDefined(id) || typeof id !== 'string' || !isValidUuid(id)) {
    throw new Error(
      `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME}[${index}].id invalide: ${String(id)}`,
    );
  }

  if (!isDefined(name) || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(
      `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME}[${index}].name est obligatoire`,
    );
  }

  if (
    !isDefined(color) ||
    typeof color !== 'string' ||
    !HEX_COLOR_PATTERN.test(color)
  ) {
    throw new Error(
      `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME}[${index}].color invalide: ${String(color)}`,
    );
  }

  if (
    isDefined(aliases) &&
    (!Array.isArray(aliases) ||
      aliases.some(
        (alias) => typeof alias !== 'string' || alias.trim().length === 0,
      ))
  ) {
    throw new Error(
      `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME}[${index}].aliases invalide`,
    );
  }

  return {
    id: id.toLowerCase(),
    name: name.trim(),
    color: normalizeHexColor(color),
    ...(aliases ? { aliases: aliases.map((alias) => alias.trim()) } : {}),
  };
};

const buildLookupValues = (seed: InternalEntitySeed): string[] =>
  [seed.name, ...(seed.aliases ?? [])].map(normalizeLookupValue);
