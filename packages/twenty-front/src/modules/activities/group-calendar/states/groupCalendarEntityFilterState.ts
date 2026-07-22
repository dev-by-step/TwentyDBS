import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// IMP (docs/AUDIT-BACKLOG.md) : filtre « voir uniquement cette entité » du
// Calendrier Groupe — indépendant du sélecteur global de la barre latérale
// (Ma Société / Vue Groupe), qui lui ne pilote que le masquage sur cette
// page (voir FIX-40). null = toutes les entités (comportement par défaut,
// inchangé).
export const groupCalendarEntityFilterState = createAtomState<string | null>({
  key: 'groupCalendarEntityFilterState',
  defaultValue: null,
  useLocalStorage: true,
});
