import { isDefined } from 'twenty-shared/utils';

// IMP-20 : détermine si le filtre d'entité persisté (localStorage) doit être
// réinitialisé vers la « Vue Groupe ». Un `selectedEntityId` stocké qui ne
// fait plus partie des entités sélectionnables par l'utilisateur (changement
// d'affectation, autre compte sur le même navigateur, entité supprimée)
// affiche « Ma Société » alors que le serveur retombe silencieusement sur
// l'entité par défaut → libellé ≠ données. On ne conclut qu'une fois le
// chargement terminé pour ne pas réinitialiser pendant un état transitoire.
export const shouldResetPersistedEntityFilter = ({
  selectedEntityId,
  selectableEntityIds,
  isLoading,
}: {
  selectedEntityId: string | null;
  selectableEntityIds: string[];
  isLoading: boolean;
}): boolean => {
  if (isLoading) {
    return false;
  }

  // Vue Groupe : rien à revalider.
  if (!isDefined(selectedEntityId) || selectedEntityId.length === 0) {
    return false;
  }

  return !selectableEntityIds.includes(selectedEntityId);
};
