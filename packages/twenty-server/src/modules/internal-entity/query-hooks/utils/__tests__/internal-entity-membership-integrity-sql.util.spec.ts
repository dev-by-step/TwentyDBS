import {
  buildCountDuplicateActiveMembershipsQuery,
  buildCountDuplicateMembershipsQuery,
  buildCreateActiveMembershipUniqueIndexQuery,
  buildCreateInternalEntityIdIndexQuery,
  buildDeduplicateActiveMembershipsQuery,
  buildDeleteRedundantSoftDeletedMembershipsQuery,
} from 'src/modules/internal-entity/query-hooks/utils/internal-entity-membership-integrity-sql.util';

describe('internal entity membership integrity SQL builders', () => {
  const membershipSqlTable = '"workspace_schema"."companyEntityMembership"';

  it('builds a deterministic active membership deduplication query', () => {
    const query = buildDeduplicateActiveMembershipsQuery({
      membershipSqlTable,
      sourceJoinColumnName: 'companyId',
    });

    expect(query).toContain('PARTITION BY "companyId", "internalEntityId"');
    expect(query).toContain('ORDER BY "createdAt" ASC NULLS LAST, "id" ASC');
    expect(query).toContain('WHERE "deletedAt" IS NULL');
    expect(query).toContain('SET "deletedAt" = NOW()');
    expect(query).toContain('RETURNING membership."id"');
    expect(query).toContain('SELECT COUNT(*)::text AS count');
  });

  it('counts duplicate active memberships without touching soft-deleted rows', () => {
    const query = buildCountDuplicateActiveMembershipsQuery({
      membershipSqlTable,
      sourceJoinColumnName: 'companyId',
    });

    expect(query).toContain('SUM(duplicate_count - 1)');
    expect(query).toContain('WHERE "deletedAt" IS NULL');
    expect(query).toContain('GROUP BY "companyId", "internalEntityId"');
    expect(query).toContain('HAVING COUNT(*) > 1');
  });

  it('counts duplicate memberships across active and soft-deleted rows', () => {
    const query = buildCountDuplicateMembershipsQuery({
      membershipSqlTable,
      sourceJoinColumnName: 'companyId',
    });

    expect(query).toContain('SUM(duplicate_count - 1)');
    expect(query).not.toContain('WHERE "deletedAt" IS NULL');
    expect(query).toContain('GROUP BY "companyId", "internalEntityId"');
    expect(query).toContain('HAVING COUNT(*) > 1');
  });

  it('deletes only redundant soft-deleted memberships while preserving active rows', () => {
    const query = buildDeleteRedundantSoftDeletedMembershipsQuery({
      membershipSqlTable,
      sourceJoinColumnName: 'companyId',
    });

    expect(query).toContain('PARTITION BY "companyId", "internalEntityId"');
    expect(query).toContain(
      'ORDER BY CASE WHEN "deletedAt" IS NULL THEN 0 ELSE 1 END',
    );
    expect(query).toContain(
      'DELETE FROM "workspace_schema"."companyEntityMembership" membership',
    );
    expect(query).toContain('AND ranked_memberships.row_number > 1');
    expect(query).toContain('AND membership."deletedAt" IS NOT NULL');
    expect(query).toContain('RETURNING membership."id"');
    expect(query).toContain('SELECT COUNT(*)::text AS count');
  });

  it('creates a partial unique index for active memberships only', () => {
    const query = buildCreateActiveMembershipUniqueIndexQuery({
      membershipSqlTable,
      sourceJoinColumnName: 'companyId',
      indexName: 'IDX_companyEntityMembership_active_entity_nnd',
      internalEntityIdIndexName: 'IDX_companyEntityMembership_internalEntityId',
    });

    expect(query).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_companyEntityMembership_active_entity_nnd"',
    );
    expect(query).toContain(
      'ON "workspace_schema"."companyEntityMembership" ("companyId", "internalEntityId")',
    );
    expect(query).toContain('NULLS NOT DISTINCT');
    expect(query).toContain('WHERE "deletedAt" IS NULL');
  });

  it('rejects unsafe identifiers before building SQL', () => {
    expect(() =>
      buildCreateActiveMembershipUniqueIndexQuery({
        membershipSqlTable,
        sourceJoinColumnName: 'companyId',
        indexName: 'IDX_company"; DROP TABLE company; --',
        internalEntityIdIndexName:
          'IDX_companyEntityMembership_internalEntityId',
      }),
    ).toThrow('Invalid SQL identifier');
  });

  it('creates a plain (non-unique) index on internalEntityId alone, reusable for direct-FK tables', () => {
    const query = buildCreateInternalEntityIdIndexQuery({
      sqlTable: membershipSqlTable,
      indexName: 'IDX_companyEntityMembership_internalEntityId',
    });

    expect(query).toContain(
      'CREATE INDEX IF NOT EXISTS "IDX_companyEntityMembership_internalEntityId"',
    );
    expect(query).toContain(
      'ON "workspace_schema"."companyEntityMembership" ("internalEntityId")',
    );
    expect(query).not.toContain('UNIQUE');
    expect(query).toContain('WHERE "deletedAt" IS NULL');
  });

  it('rejects unsafe identifiers when building the internalEntityId index', () => {
    expect(() =>
      buildCreateInternalEntityIdIndexQuery({
        sqlTable: membershipSqlTable,
        indexName: 'IDX_company"; DROP TABLE company; --',
      }),
    ).toThrow('Invalid SQL identifier');
  });
});
