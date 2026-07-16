import { quoteSqlIdentifierOrThrow } from 'src/modules/internal-entity/utils/internal-entity-command.utils';

export type InternalEntityMembershipIntegrityTarget = {
  membershipSqlTable: string;
  sourceJoinColumnName:
    | 'companyId'
    | 'personId'
    | 'workspaceMemberId'
    | 'calendarEventId';
};

export type InternalEntityMembershipUniqueIndexTarget =
  InternalEntityMembershipIntegrityTarget & {
    indexName: string;
    internalEntityIdIndexName: string;
  };

export type InternalEntityScopeIndexTarget = {
  sqlTable: string;
  indexName: string;
};

export const buildDeduplicateActiveMembershipsQuery = ({
  membershipSqlTable,
  sourceJoinColumnName,
}: InternalEntityMembershipIntegrityTarget): string => {
  const quotedJoinColumn = quoteSqlIdentifierOrThrow(sourceJoinColumnName);

  return `WITH ranked_memberships AS (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY ${quotedJoinColumn}, "internalEntityId"
             ORDER BY "createdAt" ASC NULLS LAST, "id" ASC
           ) AS row_number
    FROM ${membershipSqlTable}
    WHERE "deletedAt" IS NULL
  ),
  updated_memberships AS (
    UPDATE ${membershipSqlTable} membership
    SET "deletedAt" = NOW(),
        "updatedAt" = NOW()
    FROM ranked_memberships
    WHERE membership."id" = ranked_memberships."id"
      AND ranked_memberships.row_number > 1
    RETURNING membership."id"
  )
  SELECT COUNT(*)::text AS count
  FROM updated_memberships`;
};

export const buildCountDuplicateActiveMembershipsQuery = ({
  membershipSqlTable,
  sourceJoinColumnName,
}: InternalEntityMembershipIntegrityTarget): string => {
  const quotedJoinColumn = quoteSqlIdentifierOrThrow(sourceJoinColumnName);

  return `SELECT COALESCE(SUM(duplicate_count - 1), 0)::text AS count
  FROM (
    SELECT COUNT(*) AS duplicate_count
    FROM ${membershipSqlTable}
    WHERE "deletedAt" IS NULL
    GROUP BY ${quotedJoinColumn}, "internalEntityId"
    HAVING COUNT(*) > 1
  ) duplicate_memberships`;
};

export const buildCountDuplicateMembershipsQuery = ({
  membershipSqlTable,
  sourceJoinColumnName,
}: InternalEntityMembershipIntegrityTarget): string => {
  const quotedJoinColumn = quoteSqlIdentifierOrThrow(sourceJoinColumnName);

  return `SELECT COALESCE(SUM(duplicate_count - 1), 0)::text AS count
  FROM (
    SELECT COUNT(*) AS duplicate_count
    FROM ${membershipSqlTable}
    GROUP BY ${quotedJoinColumn}, "internalEntityId"
    HAVING COUNT(*) > 1
  ) duplicate_memberships`;
};

export const buildDeleteRedundantSoftDeletedMembershipsQuery = ({
  membershipSqlTable,
  sourceJoinColumnName,
}: InternalEntityMembershipIntegrityTarget): string => {
  const quotedJoinColumn = quoteSqlIdentifierOrThrow(sourceJoinColumnName);

  return `WITH ranked_memberships AS (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY ${quotedJoinColumn}, "internalEntityId"
             ORDER BY CASE WHEN "deletedAt" IS NULL THEN 0 ELSE 1 END,
                      "createdAt" ASC NULLS LAST,
                      "id" ASC
           ) AS row_number
    FROM ${membershipSqlTable}
  ),
  deleted_memberships AS (
    DELETE FROM ${membershipSqlTable} membership
    USING ranked_memberships
    WHERE membership."id" = ranked_memberships."id"
      AND ranked_memberships.row_number > 1
      AND membership."deletedAt" IS NOT NULL
    RETURNING membership."id"
  )
  SELECT COUNT(*)::text AS count
  FROM deleted_memberships`;
};

export const buildCreateActiveMembershipUniqueIndexQuery = ({
  membershipSqlTable,
  sourceJoinColumnName,
  indexName,
}: InternalEntityMembershipUniqueIndexTarget): string => {
  const quotedJoinColumn = quoteSqlIdentifierOrThrow(sourceJoinColumnName);
  const quotedIndexName = quoteSqlIdentifierOrThrow(indexName);

  return `CREATE UNIQUE INDEX IF NOT EXISTS ${quotedIndexName}
  ON ${membershipSqlTable} (${quotedJoinColumn}, "internalEntityId")
  NULLS NOT DISTINCT
  WHERE "deletedAt" IS NULL`;
};

/**
 * Plain (non-unique) index on `internalEntityId` alone. The composite unique
 * index above has the source column as its leading column, so it can't be
 * used by scope-filter reads that only constrain `internalEntityId` (e.g.
 * the access-policy's `{internalEntityId: {in: entityIds}}` filter). Reused
 * for both junction tables and direct-FK tables like `opportunity`.
 */
export const buildCreateInternalEntityIdIndexQuery = ({
  sqlTable,
  indexName,
}: InternalEntityScopeIndexTarget): string => {
  const quotedIndexName = quoteSqlIdentifierOrThrow(indexName);

  return `CREATE INDEX IF NOT EXISTS ${quotedIndexName}
  ON ${sqlTable} ("internalEntityId")
  WHERE "deletedAt" IS NULL`;
};
