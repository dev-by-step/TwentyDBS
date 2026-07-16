import {
  buildMembershipInsertBatch,
  buildMembershipInsertQuery,
} from 'src/modules/internal-entity/query-hooks/utils/internal-entity-source-tagging-sql.util';

describe('buildMembershipInsertQuery', () => {
  it('does not filter out soft-deleted rows in the NOT EXISTS existence check', () => {
    const { valuesSql, values } = buildMembershipInsertBatch({
      recordIds: ['record-1'],
      internalEntityId: 'entity-1',
    });

    const { text } = buildMembershipInsertQuery({
      membershipSqlTable: '"workspace_schema"."personEntityMembership"',
      sourceJoinColumnName: 'personId',
      valuesSql,
      values,
    });

    // A previously soft-deleted membership row must keep blocking
    // re-insertion, otherwise an admin's explicit detach action gets undone
    // on the next backfill/source-tagging run.
    expect(text).not.toContain('deletedAt');
    expect(text).toContain('WHERE NOT EXISTS');
    expect(text).toContain('ON CONFLICT DO NOTHING');
  });
});
