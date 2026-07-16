import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { parse } from 'papaparse';
import { isDefined } from 'twenty-shared/utils';

import { validateUuidOrThrow } from 'src/modules/internal-entity/utils/internal-entity-command.utils';

export type CsvOpportunityRow = {
  id: string;
  name: string;
  entityName: string | null;
};

type RawCsvOpportunityRow = Record<string, string | undefined>;

const MAX_CSV_FILE_SIZE_BYTES = 1024 * 1024;
const MAX_CSV_OPPORTUNITY_ROWS = 100;

export class OpportunityCsvNotFoundError extends Error {
  constructor() {
    super('docs/opportunity.csv introuvable');
    this.name = OpportunityCsvNotFoundError.name;
  }
}

@Injectable()
export class ImportCsvOpportunitiesParserService {
  private readonly logger = new Logger(
    ImportCsvOpportunitiesParserService.name,
  );

  async readCsvOpportunities(): Promise<CsvOpportunityRow[]> {
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

    const missingRequiredHeaders = ['Id', 'Nom', 'Société'].filter(
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
      this.parseCsvOpportunityRow(row, index + 2),
    );

    this.assertUniqueOpportunityIds(rows);

    return rows;
  }

  private parseCsvOpportunityRow(
    row: RawCsvOpportunityRow,
    rowNumber: number,
  ): CsvOpportunityRow {
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

  private assertUniqueOpportunityIds(rows: CsvOpportunityRow[]): void {
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
          `CSV non trouvé à ${path}, recherche dans d'autres dossiers... (${this.formatErrorMessage(
            error,
          )})`,
        );
        continue;
      }
    }

    throw new OpportunityCsvNotFoundError();
  }

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
