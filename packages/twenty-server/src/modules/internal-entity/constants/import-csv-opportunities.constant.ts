import { INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';

export const IMPORT_LOCK_PREFIX = 'import-csv-opportunities';

export const MAX_CSV_FILE_SIZE_BYTES = 1024 * 1024;
export const MAX_CSV_OPPORTUNITY_ROWS = 100;
export const CSV_OPPORTUNITY_REQUIRED_HEADERS = [
  'Id',
  'Nom',
  'Société',
  'Étape',
] as const;

export const buildCsvFileTooLargeError = (size: number): string =>
  `CSV trop volumineux: ${size} octets (max ${MAX_CSV_FILE_SIZE_BYTES})`;

export const buildCsvRowCountTooLargeError = (rowCount: number): string =>
  `CSV trop volumineux: ${rowCount} lignes (max ${MAX_CSV_OPPORTUNITY_ROWS})`;

export const buildCsvInvalidError = (errors: string): string =>
  `CSV invalide: ${errors}`;

export const buildCsvEmptyOrInvalidError = (csvPath: string): string =>
  `CSV vide ou invalide: ${csvPath}`;

export const buildCsvMissingRequiredHeadersError = (
  missingHeaders: string[],
): string =>
  `Colonnes obligatoires manquantes dans le CSV: ${missingHeaders.join(', ')}`;

export const buildCsvRequiredValueMissingError = (
  header: string,
  rowNumber: number,
): string => `Valeur CSV obligatoire manquante: ${header} ligne ${rowNumber}`;

export const buildCsvDuplicateOpportunityIdError = (
  opportunityId: string,
): string => `Id opportunité dupliqué dans le CSV: ${opportunityId}`;

export const buildCsvFileNotFoundError = (): string =>
  'docs/opportunity.csv introuvable';

export const buildUnknownInternalEntityWarning = ({
  entityName,
  opportunityId,
}: {
  entityName: string | null;
  opportunityId: string;
}): string =>
  `InternalEntity ${entityName ?? '<empty>'} introuvable, opportunité ${opportunityId} ignorée`;

export const buildUnknownInternalEntitiesCsvWarning = (
  entityNames: string[],
): string =>
  `InternalEntity inconnue(s) dans le CSV: ${entityNames.join(
    ', ',
  )}. Ajoutez-les à ${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME} ou corrigez le CSV avant de relancer.`;

export const buildMissingInternalEntityAfterMigrationError = (
  nullCount: number,
): string =>
  `${nullCount} opportunité(s) sans internalEntityId après migration. Ajoutez les entités manquantes à ${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME}, corrigez le CSV ou migrez explicitement ces opportunités.`;
