import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';
import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';

// Internal entity CLI commands are admin operations and intentionally bypass workspace user permissions.
export const INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS = {
  shouldBypassPermissionChecks: true,
} as const;

export const validateUuidOrThrow = (
  value: string,
  fieldName: string,
): string => {
  if (!isValidUuid(value)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }

  return value.toLowerCase();
};

export const quoteSqlIdentifierOrThrow = (identifier: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
};

export const buildWorkspaceSqlTableName = (
  schemaName: string,
  tableName: string,
): string =>
  `${quoteSqlIdentifierOrThrow(schemaName)}.${quoteSqlIdentifierOrThrow(
    tableName,
  )}`;

export const resolveObjectTableNameOrThrow = async ({
  objectMetadataService,
  workspaceId,
  nameSingular,
}: {
  objectMetadataService: ObjectMetadataService;
  workspaceId: string;
  nameSingular: string;
}): Promise<string> => {
  const objectMetadata = await objectMetadataService.findOneWithinWorkspace(
    workspaceId,
    {
      where: { nameSingular },
    },
  );

  if (!isDefined(objectMetadata)) {
    throw new Error(`Standard object not found in workspace: ${nameSingular}`);
  }

  return computeObjectTargetTable({
    nameSingular: objectMetadata.nameSingular,
    isCustom: objectMetadata.isCustom,
  });
};

export const resolveInternalEntitySeedId = (
  entityName: string | null,
): string | null => {
  if (!isDefined(entityName) || entityName.length === 0) {
    return null;
  }

  return (
    INTERNAL_ENTITY_SEEDS[entityName]?.id ??
    Object.values(INTERNAL_ENTITY_SEEDS).find(
      (seed) => seed.name === entityName,
    )?.id ??
    null
  );
};
