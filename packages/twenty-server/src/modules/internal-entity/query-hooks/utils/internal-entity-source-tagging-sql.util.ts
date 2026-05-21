import { randomUUID } from 'node:crypto';

export const buildMembershipInsertBatch = ({
  recordIds,
  internalEntityId,
}: {
  recordIds: string[];
  internalEntityId: string;
}): {
  valuesSql: string;
  parameters: string[];
} => {
  const parameters: string[] = [];
  const valuesSql = recordIds
    .map((recordId, index) => {
      const offset = index * 3;

      parameters.push(randomUUID(), recordId, internalEntityId);

      return `($${offset + 1}::uuid, $${offset + 2}::uuid, $${
        offset + 3
      }::uuid)`;
    })
    .join(', ');

  return { valuesSql, parameters };
};

export const buildMembershipInsertQuery = ({
  membershipSqlTable,
  sourceJoinColumnName,
  valuesSql,
}: {
  membershipSqlTable: string;
  sourceJoinColumnName: string;
  valuesSql: string;
}): string => {
  return `INSERT INTO ${membershipSqlTable}
     ("id", "${sourceJoinColumnName}", "internalEntityId", "createdAt", "updatedAt", "position")
   SELECT source.id, source.record_id, source.internal_entity_id, NOW(), NOW(), 0
   FROM (VALUES ${valuesSql}) AS source(id, record_id, internal_entity_id)
   WHERE NOT EXISTS (
     SELECT 1
     FROM ${membershipSqlTable} existing
     WHERE existing."${sourceJoinColumnName}" = source.record_id
       AND existing."internalEntityId" = source.internal_entity_id
       AND existing."deletedAt" IS NULL
   )
   ON CONFLICT DO NOTHING`;
};
