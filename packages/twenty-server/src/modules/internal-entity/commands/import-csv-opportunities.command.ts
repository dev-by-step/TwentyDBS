import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { uuidToBase36 } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

type CsvOpportunityRow = {
  id: string;
  name: string;
  entityName: string | null;
  amount: number;
  currency: string;
  companyId: string | null;
  personId: string | null;
  stage: string;
};

const ENTITY_IDS: Record<string, string> = {
  WEKNOW: '550e8400-e29b-41d4-a716-446655440001',
  DEVBYSTEP: '550e8400-e29b-41d4-a716-446655440002',
  ALLSENSIA: '550e8400-e29b-41d4-a716-446655440003',
  ANGLE_INTELLIGENCE: '550e8400-e29b-41d4-a716-446655440004',
};

@Command({
  name: 'import-csv-opportunities',
  description:
    'Importe les 10 opportunités réelles du CSV avec leurs UUIDs exacts',
})
export class ImportCsvOpportunitiesCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly objectMetadataService: ObjectMetadataService,
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

    const schemaName = `workspace_${uuidToBase36(workspaceId)}`;

    this.logger.log(
      `Import des opportunités CSV dans le workspace ${workspaceId} (schema: ${schemaName})...`,
    );

    const rows = await this.readCsvOpportunities();

    let createdCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      const entityName = row.entityName ?? 'ANGLE_INTELLIGENCE';
      const internalEntityId = ENTITY_IDS[entityName];

      if (!isDefined(internalEntityId)) {
        this.logger.warn(
          `InternalEntity ${entityName} introuvable, opportunité ${row.id} ignorée`,
        );
        skippedCount++;

        continue;
      }

      const existing = await dataSource.query(
        `SELECT id FROM "${schemaName}"."opportunity" WHERE id = $1 AND "deletedAt" IS NULL`,
        [row.id],
        undefined,
        { shouldBypassPermissionChecks: true },
      );

      if (existing.length > 0) {
        this.logger.log(`Opportunité ${row.id} déjà présente, ignorée`);
        skippedCount++;

        continue;
      }

      await dataSource.query(
        `INSERT INTO "${schemaName}"."opportunity"
         (id, name, "internalEntityId", "createdAt", "updatedAt", "position")
         VALUES ($1, $2, $3, NOW(), NOW(), 0)`,
        [row.id, row.name, internalEntityId],
        undefined,
        { shouldBypassPermissionChecks: true },
      );

      createdCount++;
      this.logger.log(`Opportunité ${row.id} (${row.name}) créée`);
    }

    this.logger.log(
      `Import terminé : ${createdCount} créée(s), ${skippedCount} ignorée(s)`,
    );

    await this.verifyImport(
      dataSource,
      schemaName,
    );
  }

  private async readCsvOpportunities(): Promise<CsvOpportunityRow[]> {
    const csvPath = await this.resolveCsvPath();
    const csvContent = await readFile(csvPath, 'utf8');
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      throw new Error(`CSV vide ou invalide: ${csvPath}`);
    }

    const [headerLine, ...dataLines] = lines;
    const headers = this.parseCsvLine(headerLine);

    const idx = {
      id: headers.indexOf('Id'),
      name: headers.indexOf('Nom'),
      company: headers.indexOf('Société'),
      amount: headers.indexOf('Montant / Amount'),
      currency: headers.indexOf('Montant / Currency'),
      companyId: headers.indexOf('Entreprise Id'),
      personId: headers.indexOf('Point de contact Id'),
      stage: headers.indexOf('Étape'),
    };

    if (idx.id === -1 || idx.name === -1 || idx.stage === -1) {
      throw new Error('Colonnes obligatoires manquantes dans le CSV');
    }

    return dataLines.map((line) => {
      const values = this.parseCsvLine(line);

      return {
        id: values[idx.id]?.trim() ?? '',
        name: values[idx.name]?.trim() ?? '',
        entityName: this.parseEntityFromCompany(values[idx.company] ?? ''),
        amount: parseInt(values[idx.amount] ?? '0', 10) || 0,
        currency: values[idx.currency]?.trim() ?? 'EUR',
        companyId: values[idx.companyId]?.trim() || null,
        personId: values[idx.personId]?.trim() || null,
        stage: values[idx.stage]?.trim() ?? '',
      };
    });
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }

      current += char;
    }
    values.push(current);

    return values;
  }

  private parseEntityFromCompany(value: string): string | null {
    if (!value) return null;

    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0];
      }
    } catch {
      // ignore
    }

    return null;
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
      } catch {
        continue;
      }
    }

    throw new Error('docs/opportunity.csv introuvable');
  }

  private async verifyImport(
    dataSource: GlobalWorkspaceDataSource,
    schemaName: string,
  ): Promise<void> {
    const csvRows = await this.readCsvOpportunities();
    const csvIds = csvRows.map((r) => r.id);

    const result = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count
       FROM "${schemaName}"."opportunity"
       WHERE id = ANY($1) AND "deletedAt" IS NULL`,
      [csvIds],
      undefined,
      { shouldBypassPermissionChecks: true },
    );

    const count = parseInt(result?.[0]?.count ?? '0', 10);

    this.logger.log(
      `Vérification : ${count}/${csvRows.length} opportunités CSV présentes en base`,
    );

    if (count < csvRows.length) {
      const present = await dataSource.query<Array<{ id: string }>>(
        `SELECT id FROM "${schemaName}"."opportunity" WHERE id = ANY($1)`,
        [csvIds],
        undefined,
        { shouldBypassPermissionChecks: true },
      );

      const presentIds = new Set(present.map((r) => r.id));

      for (const row of csvRows) {
        if (!presentIds.has(row.id)) {
          this.logger.warn(`Absente : ${row.id} (${row.name})`);
        }
      }
    }
  }
}
