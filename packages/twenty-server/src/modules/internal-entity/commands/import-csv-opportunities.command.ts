import { Command } from 'nest-commander';
import { type QueryRunner } from 'typeorm';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import {
  ImportCsvOpportunitiesParserService,
  type CsvOpportunityRow,
} from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';
import {
  buildWorkspaceSqlTableName,
  INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS,
  resolveInternalEntitySeedId,
  resolveObjectTableNameOrThrow,
  validateUuidOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-command.utils';

type ImportableCsvOpportunityRow = CsvOpportunityRow & {
  internalEntityId: string;
};

const IMPORT_LOCK_PREFIX = 'import-csv-opportunities';

@Command({
  name: 'import-csv-opportunities',
  description:
    'Importe les 10 opportunités réelles du CSV avec leurs UUIDs exacts',
})
export class ImportCsvOpportunitiesCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly importCsvOpportunitiesParserService: ImportCsvOpportunitiesParserService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    dataSource,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (!isDefined(dataSource)) {
      this.logger.log(
        `Pas de dataSource pour le workspace ${workspaceId}, ignoré`,
      );

      return;
    }

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

    this.logger.log(
      `Import des opportunités CSV dans le workspace ${validatedWorkspaceId} (schema: ${schemaName})...`,
    );

    const rows =
      await this.importCsvOpportunitiesParserService.readCsvOpportunities();
    const importableRows = this.resolveImportableRows(rows);

    if (importableRows.length === 0) {
      this.logger.log(`Import terminé : 0 créée(s), ${rows.length} ignorée(s)`);

      return;
    }

    const queryRunner = dataSource.createQueryRunner();
    let createdIds: string[] = [];

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      await this.runAdminQuery(
        dataSource,
        queryRunner,
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [`${IMPORT_LOCK_PREFIX}:${validatedWorkspaceId}`],
      );

      createdIds = await this.insertOpportunities(
        dataSource,
        queryRunner,
        opportunitySqlTable,
        importableRows,
      );

      if (createdIds.length > 0) {
        await this.verifyImport(
          dataSource,
          queryRunner,
          opportunitySqlTable,
          createdIds,
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      throw error;
    } finally {
      await queryRunner.release();
    }

    const createdCount = createdIds.length;
    const skippedCount = rows.length - createdCount;

    this.logger.log(
      `Import terminé : ${createdCount} créée(s), ${skippedCount} ignorée(s)`,
    );
  }

  private resolveImportableRows(
    rows: CsvOpportunityRow[],
  ): ImportableCsvOpportunityRow[] {
    const importableRows: ImportableCsvOpportunityRow[] = [];

    for (const row of rows) {
      const internalEntityId = resolveInternalEntitySeedId(row.entityName);

      if (!isDefined(internalEntityId)) {
        this.logger.warn(
          `InternalEntity ${row.entityName ?? '<empty>'} introuvable, opportunité ${row.id} ignorée`,
        );

        continue;
      }

      importableRows.push({
        ...row,
        internalEntityId,
      });
    }

    return importableRows;
  }

  private async insertOpportunities(
    dataSource: GlobalWorkspaceDataSource,
    queryRunner: QueryRunner,
    opportunitySqlTable: string,
    rows: ImportableCsvOpportunityRow[],
  ): Promise<string[]> {
    const { valuesSql, parameters } = this.buildInsertBatch(rows);

    const createdRows = await this.runAdminQuery<Array<{ id: string }>>(
      dataSource,
      queryRunner,
      `INSERT INTO ${opportunitySqlTable}
       (id, name, "internalEntityId", "createdAt", "updatedAt", "position")
       VALUES ${valuesSql}
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      parameters,
    );

    return createdRows.map(({ id }) => id);
  }

  private buildInsertBatch(rows: ImportableCsvOpportunityRow[]): {
    valuesSql: string;
    parameters: string[];
  } {
    const parameters: string[] = [];

    const valuesSql = rows
      .map((row, index) => {
        const offset = index * 3;

        parameters.push(row.id, row.name, row.internalEntityId);

        return `($${offset + 1}, $${offset + 2}, $${
          offset + 3
        }, NOW(), NOW(), 0)`;
      })
      .join(', ');

    return { valuesSql, parameters };
  }

  private async verifyImport(
    dataSource: GlobalWorkspaceDataSource,
    queryRunner: QueryRunner,
    opportunitySqlTable: string,
    createdIds: string[],
  ): Promise<void> {
    const result = await this.runAdminQuery<Array<{ count: string }>>(
      dataSource,
      queryRunner,
      `SELECT COUNT(*)::text AS count
       FROM ${opportunitySqlTable}
       WHERE id = ANY($1) AND "deletedAt" IS NULL`,
      [createdIds],
    );

    const count = parseInt(result?.[0]?.count ?? '0', 10);

    this.logger.log(
      `Vérification : ${count}/${createdIds.length} opportunités créées présentes en base`,
    );

    if (count < createdIds.length) {
      this.logger.warn(
        `${createdIds.length - count} opportunité(s) non trouvée(s) après import`,
      );
    }
  }

  private async runAdminQuery<T>(
    dataSource: GlobalWorkspaceDataSource,
    queryRunner: QueryRunner,
    query: string,
    parameters: unknown[] = [],
  ): Promise<T> {
    return dataSource.query<T>(
      query,
      parameters,
      queryRunner,
      INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS,
    );
  }
}
