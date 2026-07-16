import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { isDefined } from 'twenty-shared/utils';
import { getConflictingRecordFromApolloError } from '~/utils/get-conflicting-record-from-apollo-error.util';

// Message technique stable levé par le serveur pour toute violation
// d'unicité (duplicate check applicatif ET contrainte/index SQL) — voir
// `handleDuplicateKeyError` côté twenty-server. Le `userFriendlyMessage`
// est localisé, ce message-ci ne l'est pas.
const DUPLICATE_ENTRY_MESSAGE = 'A duplicate entry was detected';

/**
 * FIX-29 : sur un workspace déjà seedé (ou un re-run de l'onboarding),
 * créer un enregistrement de base échoue en duplicate. Quand le serveur
 * identifie l'enregistrement en conflit, on peut le réutiliser au lieu de
 * bloquer tout le wizard.
 *
 * Retourne l'id de l'enregistrement en conflit si (et seulement si) l'erreur
 * est un duplicate portant un `conflictingRecordId` pour l'objet attendu.
 */
export const getRecoverableDuplicateRecordId = (
  error: unknown,
  objectNameSingular: string,
): string | null => {
  if (!CombinedGraphQLErrors.is(error)) {
    return null;
  }

  const conflictingRecord = getConflictingRecordFromApolloError(error);

  if (
    isDefined(conflictingRecord) &&
    conflictingRecord.conflictingObjectNameSingular === objectNameSingular
  ) {
    return conflictingRecord.conflictingRecordId;
  }

  return null;
};

/**
 * Vrai pour toute erreur de duplicate, même sans `conflictingRecordId`
 * (cas des index uniques composites dont le serveur ne résout pas
 * l'enregistrement en conflit). Utilisé pour ignorer la re-création d'une
 * membership déjà existante : l'état désiré est déjà atteint.
 */
export const isDuplicateRecordError = (error: unknown): boolean => {
  if (!CombinedGraphQLErrors.is(error)) {
    return false;
  }

  return error.errors.some(
    (graphQLError) => graphQLError.message === DUPLICATE_ENTRY_MESSAGE,
  );
};
