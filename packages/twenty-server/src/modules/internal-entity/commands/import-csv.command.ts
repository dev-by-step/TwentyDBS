import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'nest-commander';
import { parse } from 'papaparse';
import { type QueryRunner } from 'typeorm';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { InternalEntityConfigurationService } from 'src/modules/internal-entity/services/internal-entity-configuration.service';
import {
  buildWorkspaceSqlTableName,
  INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS,
  resolveObjectTableNameOrThrow,
  validateUuidOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-command.utils';

type FullCsvOpportunityRow = {
  id: string;
  name: string;
  entityName: string | null;
  amount: number;
  currency: string;
  companyId: string | null;
  personId: string | null;
  stage: string;
};

type RawCsvOpportunityRow = Record<string, string | undefined>;

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
const MAX_CSV_FILE_SIZE_BYTES = 1024 * 1024;
const MAX_CSV_OPPORTUNITY_ROWS = 100;

export class ImportCsvOpportunityCsvNotFoundError extends Error {
  constructor() {
    super('docs/opportunity.csv introuvable');
    this.name = ImportCsvOpportunityCsvNotFoundError.name;
  }
}

@Command({
  name: 'import-csv',
  description:
    'Importe les données du CSV (companies, personnes, opportunités)',
})
export class ImportCsvCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly internalEntityConfigurationService: InternalEntityConfigurationService,
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

    const rows = await this.readFullCsvOpportunities();
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

  private async readFullCsvOpportunities(): Promise<FullCsvOpportunityRow[]> {
    const csvPath = await this.resolveCsvPath();
    const csvStats = await stat(csvPath);

    if (csvStats.size > MAX_CSV_FILE_SIZE_BYTES) {
      throw new Error(
        `CSV trop volumineux: ${csvStats.size} octets (max ${MAX_CSV_FILE_SIZE_BYTES})`,
      );
    }

    const csvContent = await readFile(csvPath, 'utf8');

    const parsed = parse<RawCsvOpportunityRow>(csvContent, {
      delimiter: ',',
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''),
    });

    if (parsed.errors.length > 0) {
      const errors = parsed.errors
        .map((error) => `${error.message} (ligne ${error.row ?? 'n/a'})`)
        .join(', ');

      throw new Error(`CSV invalide: ${errors}`);
    }

    const headers = parsed.meta.fields ?? [];

    if (headers.length === 0 || parsed.data.length === 0) {
      throw new Error(`CSV vide ou invalide: ${csvPath}`);
    }

    const missingRequiredHeaders = ['Id', 'Nom', 'Société', 'Étape'].filter(
      (header) => !headers.includes(header),
    );

    if (missingRequiredHeaders.length > 0) {
      throw new Error(
        `Colonnes obligatoires manquantes dans le CSV: ${missingRequiredHeaders.join(
          ', ',
        )}`,
      );
    }

    if (parsed.data.length > MAX_CSV_OPPORTUNITY_ROWS) {
      throw new Error(
        `CSV trop volumineux: ${parsed.data.length} lignes (max ${MAX_CSV_OPPORTUNITY_ROWS})`,
      );
    }

    const rows = parsed.data.map((row, index) =>
      this.parseFullCsvOpportunityRow(row, index + 2),
    );

    this.assertUniqueOpportunityIds(rows);

    return rows;
  }

  private parseFullCsvOpportunityRow(
    row: RawCsvOpportunityRow,
    rowNumber: number,
  ): FullCsvOpportunityRow {
    return {
      id: validateUuidOrThrow(
        this.getRequiredCsvValue(row, 'Id', rowNumber),
        `Id ligne ${rowNumber}`,
      ),
      name: this.getRequiredCsvValue(row, 'Nom', rowNumber),
      entityName: this.parseEntityName(
        this.getRequiredCsvValue(row, 'Société', rowNumber),
        rowNumber,
      ),
      amount: parseInt(row['Montant / Amount'] ?? '0', 10) || 0,
      currency: row['Montant / Currency']?.trim() ?? 'EUR',
      companyId: this.validateUuidOptional(
        this.getOptionalCsvValue(row, 'Entreprise Id'),
        `Entreprise Id ligne ${rowNumber}`,
      ),
      personId: this.validateUuidOptional(
        this.getOptionalCsvValue(row, 'Point de contact Id'),
        `Point de contact Id ligne ${rowNumber}`,
      ),
      stage: this.getRequiredCsvValue(row, 'Étape', rowNumber),
    };
  }

  private getRequiredCsvValue(
    row: RawCsvOpportunityRow,
    header: string,
    rowNumber: number,
  ): string {
    const value = row[header]?.trim();

    if (!isDefined(value) || value.length === 0) {
      throw new Error(
        `Valeur CSV obligatoire manquante: ${header} ligne ${rowNumber}`,
      );
    }

    return value;
  }

  private getOptionalCsvValue(
    row: RawCsvOpportunityRow,
    header: string,
  ): string | undefined {
    const value = row[header]?.trim();

    return isDefined(value) && value.length > 0 ? value : undefined;
  }

  private parseEntityName(value: string, rowNumber: number): string | null {
    if (value.length === 0) {
      return null;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(
        `Société ligne ${rowNumber} doit être un tableau JSON valide, reçu: ${value} (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(
        `Société ligne ${rowNumber} doit être un tableau JSON non vide, reçu: ${value}`,
      );
    }

    const firstEntry = parsed[0];

    if (typeof firstEntry !== 'string' || firstEntry.trim().length === 0) {
      throw new Error(
        `Société ligne ${rowNumber} doit contenir une chaîne non vide en première position, reçu: ${value}`,
      );
    }

    return firstEntry.trim();
  }

  private validateUuidOptional(
    value: string | undefined,
    fieldName: string,
  ): string | null {
    if (!isDefined(value)) return null;

    return validateUuidOrThrow(value, fieldName);
  }

  private assertUniqueOpportunityIds(rows: FullCsvOpportunityRow[]): void {
    const seenOpportunityIds = new Set<string>();

    for (const row of rows) {
      if (seenOpportunityIds.has(row.id)) {
        throw new Error(`Id opportunité dupliqué dans le CSV: ${row.id}`);
      }

      seenOpportunityIds.add(row.id);
    }
  }

  private async resolveCsvPath(): Promise<string> {
    for (const depth of [0, 1, 2, 3, 4]) {
      const path = resolve(
        process.cwd(),
        '../'.repeat(depth),
        'docs/opportunity.csv',
      );

      try {
        await access(path);

        return path;
      } catch (error) {
        this.logger.debug(
          `CSV non trouvé à ${path}, recherche dans d'autres dossiers... (${error instanceof Error ? error.message : String(error)})`,
        );
        continue;
      }
    }

    throw new ImportCsvOpportunityCsvNotFoundError();
  }

  private resolveImportableRows(
    rows: FullCsvOpportunityRow[],
  ): (FullCsvOpportunityRow & { internalEntityId: string })[] {
    const importable: (FullCsvOpportunityRow & {
      internalEntityId: string;
    })[] = [];

    for (const row of rows) {
      const internalEntityId =
        this.internalEntityConfigurationService.resolveInternalEntityId(
          row.entityName,
        );

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
    rows: (FullCsvOpportunityRow & { internalEntityId: string })[],
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
    rows: (FullCsvOpportunityRow & { internalEntityId: string })[],
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
    rows: (FullCsvOpportunityRow & { internalEntityId: string })[],
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
