// FIX-30 : les workspaces provisionnés par une ancienne version du fork
// portent des champs de relation nommés d'après le label français camelCasé
// (« Entité interne » → `entiteInterne`) alors que le code actuel cherche
// `internalEntity`. Sans migration, `init-internal-entities` échoue en
// `Champ introuvable: personEntityMembership.internalEntity` avant tout
// seed/backfill/index. Le `joinColumnName` stocké dans les settings est déjà
// `internalEntityId` sur ces workspaces : le renommage est purement une mise
// à jour de la ligne `core."fieldMetadata"`, sans migration physique.

export const INTERNAL_ENTITY_RELATION_FIELD_NAME = 'internalEntity';

// Alias hérités constatés. Étendre cette liste si un autre nommage historique
// est découvert sur un workspace.
export const LEGACY_INTERNAL_ENTITY_RELATION_FIELD_NAMES = [
  'entiteInterne',
] as const;

// Objets porteurs d'une relation MANY_TO_ONE vers internalEntity.
export const INTERNAL_ENTITY_RELATION_HOST_OBJECT_NAMES = [
  'personEntityMembership',
  'companyEntityMembership',
  'workspaceMemberEntityMembership',
  'calendarEventEntityAudience',
  'opportunity',
] as const;

const assertSafeCamelCaseIdentifier = (value: string): string => {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Invalid metadata identifier: ${value}`);
  }

  return value;
};

const toSqlStringList = (values: readonly string[]): string =>
  values.map((value) => `'${assertSafeCamelCaseIdentifier(value)}'`).join(', ');

/**
 * Renomme les champs de relation hérités vers `internalEntity` dans
 * `core."fieldMetadata"`, uniquement quand aucun champ `internalEntity`
 * n'existe déjà sur le même objet (idempotent, sans risque de collision).
 * Paramètre : $1 = workspaceId. Retourne les `nameSingular` des objets
 * renommés (pour le log et l'invalidation de cache).
 */
export const buildRenameLegacyInternalEntityFieldsQuery = (): string => {
  const legacyNames = toSqlStringList(
    LEGACY_INTERNAL_ENTITY_RELATION_FIELD_NAMES,
  );
  const hostObjectNames = toSqlStringList(
    INTERNAL_ENTITY_RELATION_HOST_OBJECT_NAMES,
  );
  const targetName = assertSafeCamelCaseIdentifier(
    INTERNAL_ENTITY_RELATION_FIELD_NAME,
  );

  return `WITH renamed_fields AS (
    UPDATE core."fieldMetadata" field
    SET name = '${targetName}',
        "updatedAt" = now()
    FROM core."objectMetadata" object
    WHERE object.id = field."objectMetadataId"
      AND field."workspaceId" = $1
      AND field.type = 'RELATION'
      AND field.name IN (${legacyNames})
      AND object."nameSingular" IN (${hostObjectNames})
      AND NOT EXISTS (
        SELECT 1
        FROM core."fieldMetadata" existing
        WHERE existing."objectMetadataId" = field."objectMetadataId"
          AND existing.name = '${targetName}'
      )
    RETURNING object."nameSingular" AS "objectNameSingular"
  )
  SELECT "objectNameSingular" FROM renamed_fields`;
};
