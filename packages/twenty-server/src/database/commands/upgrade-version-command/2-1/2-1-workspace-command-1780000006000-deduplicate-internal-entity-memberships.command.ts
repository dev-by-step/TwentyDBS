import { Command } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  buildCountDuplicateActiveMembershipsQuery,
  buildCountDuplicateMembershipsQuery,
  buildCreateActiveMembershipUniqueIndexQuery,
  buildCreateInternalEntityIdIndexQuery,
  buildDeduplicateActiveMembershipsQuery,
  buildDeleteRedundantSoftDeletedMembershipsQuery,
  type InternalEntityMembershipUniqueIndexTarget,
} from 'src/modules/internal-entity/query-hooks/utils/internal-entity-membership-integrity-sql.util';
import {
  buildWorkspaceSqlTableName,
  INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS,
  resolveObjectTableNameOrThrow,
  validateUuidOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-command.utils';

const MEMBERSHIP_OBJECTS = [
  {
    nameSingular: 'companyEntityMembership',
    sourceJoinColumnName: 'companyId',
    indexName: 'IDX_companyEntityMembership_active_entity_nnd',
    internalEntityIdIndexName: 'IDX_companyEntityMembership_internalEntityId',
  },
  {
    nameSingular: 'personEntityMembership',
    sourceJoinColumnName: 'personId',
    indexName: 'IDX_personEntityMembership_active_entity_nnd',
    internalEntityIdIndexName: 'IDX_personEntityMembership_internalEntityId',
  },
  {
    nameSingular: 'workspaceMemberEntityMembership',
    sourceJoinColumnName: 'workspaceMemberId',
    indexName: 'IDX_workspaceMemberEntity_active_entity_nnd',
    internalEntityIdIndexName: 'IDX_workspaceMemberEntity_internalEntityId',
  },
  {
    nameSingular: 'calendarEventEntityAudience',
    sourceJoinColumnName: 'calendarEventId',
    indexName: 'IDX_calendarEventEntityAudience_active_entity_nnd',
    internalEntityIdIndexName:
      'IDX_calendarEventEntityAudience_internalEntityId',
  },
] as const;

@RegisteredWorkspaceCommand('2.1.0', 1780000006000)
@Command({
  name: 'upgrade:2-1:deduplicate-internal-entity-memberships',
  description:
    'Deduplicate InternalEntity membership junction rows and add partial unique indexes',
})
export class DeduplicateInternalEntityMembershipsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly objectMetadataService: ObjectMetadataService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    dataSource,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (!isDefined(dataSource)) {
      this.logger.log(
        `Pas de dataSource pour le workspace ${workspaceId}, ignoré`,
      );

      return;
    }

    const membershipTargets = await this.resolveMembershipTargets({
      workspaceId,
      dataSource,
    });
    const isDryRun = options.dryRun ?? false;

    for (const membershipTarget of membershipTargets) {
      if (isDryRun) {
        const activeDuplicateCountRows = await this.runAdminQuery<
          Array<{ count: string }>
        >(
          dataSource,
          buildCountDuplicateActiveMembershipsQuery(membershipTarget),
        );
        const activeDuplicateCount = parseInt(
          activeDuplicateCountRows[0]?.count ?? '0',
          10,
        );
        const totalDuplicateCountRows = await this.runAdminQuery<
          Array<{ count: string }>
        >(dataSource, buildCountDuplicateMembershipsQuery(membershipTarget));
        const totalDuplicateCount = parseInt(
          totalDuplicateCountRows[0]?.count ?? '0',
          10,
        );

        this.logger.log(
          `[DRY RUN] ${activeDuplicateCount} membership(s) actif(s) dupliqué(s), ${totalDuplicateCount} membership(s) redondant(s) total détecté(s) dans ${membershipTarget.membershipSqlTable}`,
        );

        continue;
      }

      const deduplicatedMembershipRows = await this.runAdminQuery<
        Array<{ count: string }>
      >(dataSource, buildDeduplicateActiveMembershipsQuery(membershipTarget));
      const deduplicatedMembershipCount = parseInt(
        deduplicatedMembershipRows[0]?.count ?? '0',
        10,
      );

      this.logger.log(
        `${deduplicatedMembershipCount} membership(s) actif(s) dupliqué(s) nettoyé(s) dans ${membershipTarget.membershipSqlTable}`,
      );

      const deletedMembershipRows = await this.runAdminQuery<
        Array<{ count: string }>
      >(
        dataSource,
        buildDeleteRedundantSoftDeletedMembershipsQuery(membershipTarget),
      );
      const deletedMembershipCount = parseInt(
        deletedMembershipRows[0]?.count ?? '0',
        10,
      );

      this.logger.log(
        `${deletedMembershipCount} membership(s) soft-delete redondant(s) supprimé(s) dans ${membershipTarget.membershipSqlTable}`,
      );

      await this.runAdminQuery(
        dataSource,
        buildCreateActiveMembershipUniqueIndexQuery(membershipTarget),
      );
      await this.runAdminQuery(
        dataSource,
        buildCreateInternalEntityIdIndexQuery({
          sqlTable: membershipTarget.membershipSqlTable,
          indexName: membershipTarget.internalEntityIdIndexName,
        }),
      );
    }

    await this.ensureOpportunityInternalEntityIdIndex({
      workspaceId,
      dataSource,
      isDryRun,
    });
  }

  private async ensureOpportunityInternalEntityIdIndex({
    workspaceId,
    dataSource,
    isDryRun,
  }: {
    workspaceId: string;
    dataSource: GlobalWorkspaceDataSource;
    isDryRun: boolean;
  }): Promise<void> {
    const validatedWorkspaceId = validateUuidOrThrow(
      workspaceId,
      'workspaceId',
    );
    const schemaName = getWorkspaceSchemaName(validatedWorkspaceId);
    const opportunityTableName = await resolveObjectTableNameOrThrow({
      objectMetadataService: this.objectMetadataService,
      workspaceId: validatedWorkspaceId,
      nameSingular: 'opportunity',
    });
    const opportunitySqlTable = buildWorkspaceSqlTableName(
      schemaName,
      opportunityTableName,
    );

    if (isDryRun) {
      this.logger.log(
        `[DRY RUN] index "IDX_opportunity_internalEntityId" serait créé sur ${opportunitySqlTable}`,
      );

      return;
    }

    await this.runAdminQuery(
      dataSource,
      buildCreateInternalEntityIdIndexQuery({
        sqlTable: opportunitySqlTable,
        indexName: 'IDX_opportunity_internalEntityId',
      }),
    );
  }

  private async resolveMembershipTargets({
    workspaceId,
  }: {
    workspaceId: string;
    dataSource: GlobalWorkspaceDataSource;
  }): Promise<InternalEntityMembershipUniqueIndexTarget[]> {
    const validatedWorkspaceId = validateUuidOrThrow(
      workspaceId,
      'workspaceId',
    );
    const schemaName = getWorkspaceSchemaName(validatedWorkspaceId);

    return Promise.all(
      MEMBERSHIP_OBJECTS.map(async (membershipObject) => {
        const tableName = await resolveObjectTableNameOrThrow({
          objectMetadataService: this.objectMetadataService,
          workspaceId: validatedWorkspaceId,
          nameSingular: membershipObject.nameSingular,
        });

        return {
          membershipSqlTable: buildWorkspaceSqlTableName(schemaName, tableName),
          sourceJoinColumnName: membershipObject.sourceJoinColumnName,
          indexName: membershipObject.indexName,
          internalEntityIdIndexName: membershipObject.internalEntityIdIndexName,
        };
      }),
    );
  }

  private async runAdminQuery<T>(
    dataSource: GlobalWorkspaceDataSource,
    query: string,
    parameters: unknown[] = [],
  ): Promise<T> {
    return dataSource.query<T>(
      query,
      parameters,
      undefined,
      INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS,
    );
  }
}
