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

type CompanyCsvSeed = {
  id: string;
  name: string | null;
  position: number;
};

type PersonCsvSeed = {
  id: string;
  nameFirstName: string | null;
  nameLastName: string | null;
  emailsPrimaryEmail: string;
  companyId: string | null;
  position: number;
};

type OpportunityCsvSeed = {
  id: string;
  name: string;
  amountAmountMicros: number;
  amountCurrencyCode: string;
  stage: string;
  pointOfContactId: string | null;
  companyId: string | null;
  internalEntityId: string;
  position: number;
};

const IMPORT_LOCK_PREFIX = 'import-csv';
const GENERATED_CONTACT_EMAIL_DOMAIN = 'import.local';

@Command({
  name: 'import-csv',
  description:
    'Importe les données du CSV (companies, personnes, opportunités)',
})
export class ImportCsvCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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

    const companyTableName = await resolveObjectTableNameOrThrow({
      objectMetadataService: this.objectMetadataService,
      workspaceId: validatedWorkspaceId,
      nameSingular: 'company',
    });
    const personTableName = await resolveObjectTableNameOrThrow({
      objectMetadataService: this.objectMetadataService,
      workspaceId: validatedWorkspaceId,
      nameSingular: 'person',
    });
    const opportunityTableName = await resolveObjectTableNameOrThrow({
      objectMetadataService: this.objectMetadataService,
      workspaceId: validatedWorkspaceId,
      nameSingular: 'opportunity',
    });

    const companySqlTable = buildWorkspaceSqlTableName(
      schemaName,
      companyTableName,
    );
    const personSqlTable = buildWorkspaceSqlTableName(
      schemaName,
      personTableName,
    );
    const opportunitySqlTable = buildWorkspaceSqlTableName(
      schemaName,
      opportunityTableName,
    );

    this.logger.log(
      `Import CSV complet — workspace ${validatedWorkspaceId} (schema: ${schemaName})...`,
    );

    const rows =
      await this.importCsvOpportunitiesParserService.readCsvOpportunities();
    const importableRows = this.resolveImportableRows(rows);

    if (importableRows.length === 0) {
      this.logger.log(`Aucune ligne importable trouvée dans le CSV.`);

      return;
    }

    const queryRunner = dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      await this.runAdminQuery(
        dataSource,
        queryRunner,
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [`${IMPORT_LOCK_PREFIX}:${validatedWorkspaceId}`],
      );

      const companySeeds = this.buildCompanySeeds(importableRows);
      const personSeeds = this.buildPersonSeeds(importableRows);
      const opportunitySeeds = this.buildOpportunitySeeds(importableRows);

      const createdCompanyCount = await this.insertCompanies(
        dataSource,
        queryRunner,
        companySqlTable,
        companySeeds,
      );
      const createdPersonCount = await this.insertPersons(
        dataSource,
        queryRunner,
        personSqlTable,
        personSeeds,
      );
      const upsertedOpportunityCount = await this.upsertOpportunities(
        dataSource,
        queryRunner,
        opportunitySqlTable,
        opportunitySeeds,
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Import terminé : ${createdCompanyCount} entreprise(s), ${createdPersonCount} personne(s), ${upsertedOpportunityCount} opportunité(s)`,
      );
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private resolveImportableRows(
    rows: CsvOpportunityRow[],
  ): (CsvOpportunityRow & { internalEntityId: string })[] {
    const importable: (CsvOpportunityRow & { internalEntityId: string })[] = [];

    for (const row of rows) {
      const internalEntityId = resolveInternalEntitySeedId(row.entityName);

      if (!isDefined(internalEntityId)) {
        this.logger.warn(
          `InternalEntity ${row.entityName ?? '<empty>'} introuvable, opportunité ${row.id} ignorée`,
        );

        continue;
      }

      importable.push({ ...row, internalEntityId });
    }

    return importable;
  }

  private buildCompanySeeds(
    rows: (CsvOpportunityRow & { internalEntityId: string })[],
  ): CompanyCsvSeed[] {
    const seenCompanyIds = new Set<string>();
    const companies: CompanyCsvSeed[] = [];
    let position = 1;

    for (const row of rows) {
      if (!row.companyId || seenCompanyIds.has(row.companyId)) continue;

      seenCompanyIds.add(row.companyId);
      companies.push({
        id: row.companyId,
        name: null,
        position: position++,
      });
    }

    return companies;
  }

  private buildPersonSeeds(
    rows: (CsvOpportunityRow & { internalEntityId: string })[],
  ): PersonCsvSeed[] {
    const seenPersonIds = new Set<string>();
    const persons: PersonCsvSeed[] = [];
    let position = 1;

    for (const row of rows) {
      if (!row.personId || seenPersonIds.has(row.personId)) continue;

      seenPersonIds.add(row.personId);
      persons.push({
        id: row.personId,
        nameFirstName: null,
        nameLastName: null,
        emailsPrimaryEmail: `${row.personId}@${GENERATED_CONTACT_EMAIL_DOMAIN}`,
        companyId: row.companyId,
        position: position++,
      });
    }

    return persons;
  }

  private buildOpportunitySeeds(
    rows: (CsvOpportunityRow & { internalEntityId: string })[],
  ): OpportunityCsvSeed[] {
    return rows.map((row, index) => ({
      id: row.id,
      name: row.name,
      amountAmountMicros: row.amount * 1_000_000,
      amountCurrencyCode: row.currency,
      stage: row.stage,
      pointOfContactId: row.personId,
      companyId: row.companyId,
      internalEntityId: row.internalEntityId,
      position: index + 1,
    }));
  }

  private async insertCompanies(
    dataSource: GlobalWorkspaceDataSource,
    queryRunner: QueryRunner,
    companySqlTable: string,
    companies: CompanyCsvSeed[],
  ): Promise<number> {
    if (companies.length === 0) return 0;

    const { columns, valuesSql, parameters } =
      this.buildCompanyBatch(companies);

    const result = await this.runAdminQuery<Array<{ id: string }>>(
      dataSource,
      queryRunner,
      `INSERT INTO ${companySqlTable}
       (${columns.join(', ')})
       VALUES ${valuesSql}
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      parameters,
    );

    return result.length;
  }

  private buildCompanyBatch(companies: CompanyCsvSeed[]) {
    const columns = ['id', 'name', 'position', 'createdAt', 'updatedAt'];

    const parameters: unknown[] = [];

    const valuesSql = companies
      .map((company) => {
        const rowParameters = [
          company.id,
          company.name,
          company.position,
        ] as const;
        const offset = parameters.length;

        parameters.push(...rowParameters);

        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, NOW(), NOW())`;
      })
      .join(', ');

    return { columns, valuesSql, parameters };
  }

  private async insertPersons(
    dataSource: GlobalWorkspaceDataSource,
    queryRunner: QueryRunner,
    personSqlTable: string,
    persons: PersonCsvSeed[],
  ): Promise<number> {
    if (persons.length === 0) return 0;

    const { columns, valuesSql, parameters } = this.buildPersonBatch(persons);

    const result = await this.runAdminQuery<Array<{ id: string }>>(
      dataSource,
      queryRunner,
      `INSERT INTO ${personSqlTable}
       (${columns.join(', ')})
       VALUES ${valuesSql}
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      parameters,
    );

    return result.length;
  }

  private buildPersonBatch(persons: PersonCsvSeed[]) {
    const columns = [
      'id',
      'nameFirstName',
      'nameLastName',
      'emailsPrimaryEmail',
      'companyId',
      'position',
      'createdAt',
      'updatedAt',
    ];

    const parameters: unknown[] = [];

    const valuesSql = persons
      .map((person) => {
        const rowParameters = [
          person.id,
          person.nameFirstName,
          person.nameLastName,
          person.emailsPrimaryEmail,
          person.companyId ?? null,
          person.position,
        ] as const;
        const offset = parameters.length;

        parameters.push(...rowParameters);

        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, NOW(), NOW())`;
      })
      .join(', ');

    return { columns, valuesSql, parameters };
  }

  private async upsertOpportunities(
    dataSource: GlobalWorkspaceDataSource,
    queryRunner: QueryRunner,
    opportunitySqlTable: string,
    opportunities: OpportunityCsvSeed[],
  ): Promise<number> {
    if (opportunities.length === 0) return 0;

    const { columns, valuesSql, parameters } =
      this.buildOpportunityBatch(opportunities);

    const result = await this.runAdminQuery<Array<{ id: string }>>(
      dataSource,
      queryRunner,
      `INSERT INTO ${opportunitySqlTable}
       (${columns.join(', ')})
       VALUES ${valuesSql}
       ON CONFLICT (id) DO UPDATE SET
         "name" = EXCLUDED."name",
         "amountAmountMicros" = EXCLUDED."amountAmountMicros",
         "amountCurrencyCode" = EXCLUDED."amountCurrencyCode",
         "stage" = EXCLUDED."stage",
         "pointOfContactId" = EXCLUDED."pointOfContactId",
         "companyId" = EXCLUDED."companyId",
         "internalEntityId" = EXCLUDED."internalEntityId",
         "updatedAt" = NOW()
       RETURNING id`,
      parameters,
    );

    return result.length;
  }

  private buildOpportunityBatch(opportunities: OpportunityCsvSeed[]) {
    const columns = [
      'id',
      'name',
      'amountAmountMicros',
      'amountCurrencyCode',
      'stage',
      'pointOfContactId',
      'companyId',
      'internalEntityId',
      'position',
      'createdAt',
      'updatedAt',
    ];

    const parameters: unknown[] = [];

    const valuesSql = opportunities
      .map((opp) => {
        const rowParameters = [
          opp.id,
          opp.name,
          opp.amountAmountMicros,
          opp.amountCurrencyCode,
          opp.stage,
          opp.pointOfContactId ?? null,
          opp.companyId ?? null,
          opp.internalEntityId,
          opp.position,
        ] as const;
        const offset = parameters.length;

        parameters.push(...rowParameters);

        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, NOW(), NOW())`;
      })
      .join(', ');

    return { columns, valuesSql, parameters };
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
