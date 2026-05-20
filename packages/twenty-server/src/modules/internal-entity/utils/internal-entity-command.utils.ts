import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';

// Internal entity CLI commands are admin operations and intentionally bypass workspace user permissions.
export const INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS = {
  shouldBypassPermissionChecks: true,
} as const;

export const validateUuidOrThrow = (
  value: string,
  fieldName: string,
): string => {
  if (!isValidUuid(value)) {
    throw new Error(`${fieldName} invalide: ${value}`);
  }

  return value.toLowerCase();
};

export const quoteSqlIdentifierOrThrow = (identifier: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Identifiant SQL invalide: ${identifier}`);
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
    throw new Error(
      `Objet standard introuvable dans le workspace: ${nameSingular}`,
    );
  }

  return computeObjectTargetTable({
    nameSingular: objectMetadata.nameSingular,
    isCustom: objectMetadata.isCustom,
  });
};
