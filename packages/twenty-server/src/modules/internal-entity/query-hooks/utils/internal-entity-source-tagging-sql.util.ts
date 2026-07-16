import { randomUUID } from 'node:crypto';

import { quoteSqlIdentifierOrThrow } from 'src/modules/internal-entity/utils/internal-entity-command.utils';

export type InternalEntityMembershipInsertMapping = {
  recordId: string;
  internalEntityId: string;
};

export const buildMembershipInsertBatchFromMappings = ({
  mappings,
}: {
  mappings: InternalEntityMembershipInsertMapping[];
}): {
  valuesSql: string;
  values: string[];
} => {
  const values: string[] = [];
  const valuesSql = mappings
    .map((mapping, index) => {
      const offset = index * 3;

      values.push(randomUUID(), mapping.recordId, mapping.internalEntityId);

      return `($${offset + 1}::uuid, $${offset + 2}::uuid, $${
        offset + 3
      }::uuid)`;
    })
    .join(', ');

  return { valuesSql, values };
};

// Convenience wrapper for the common case where every record is tagged with
// the same internal entity (single-entity source tagging).
export const buildMembershipInsertBatch = ({
  recordIds,
  internalEntityId,
}: {
  recordIds: string[];
  internalEntityId: string;
}): {
  valuesSql: string;
  values: string[];
} =>
  buildMembershipInsertBatchFromMappings({
    mappings: recordIds.map((recordId) => ({ recordId, internalEntityId })),
  });

// The NOT EXISTS check intentionally matches rows regardless of `deletedAt`:
// this insert is re-run on every source-tagging create and on every
// `init-internal-entities` backfill (including at every server boot), so an
// admin who explicitly soft-deleted a membership row must not see it silently
// resurrected on the next run. Only a row that never existed for this
// (source, entity) pair gets (re-)inserted.
export const buildMembershipInsertQuery = ({
  membershipSqlTable,
  sourceJoinColumnName,
  valuesSql,
  values,
}: {
  membershipSqlTable: string;
  sourceJoinColumnName: string;
  valuesSql: string;
  values: string[];
}): {
  text: string;
  values: string[];
} => {
  const quotedJoinColumn = quoteSqlIdentifierOrThrow(sourceJoinColumnName);

  return {
    text: `INSERT INTO ${membershipSqlTable}
     ("id", ${quotedJoinColumn}, "internalEntityId", "createdAt", "updatedAt", "position")
   SELECT source.id, source.record_id, source.internal_entity_id, NOW(), NOW(), 0
   FROM (VALUES ${valuesSql}) AS source(id, record_id, internal_entity_id)
   WHERE NOT EXISTS (
     SELECT 1
     FROM ${membershipSqlTable} existing
     WHERE existing.${quotedJoinColumn} = source.record_id
       AND existing."internalEntityId" = source.internal_entity_id
   )
   ON CONFLICT DO NOTHING`,
    values,
  };
};
