// Ces IDs sont stables et correspondent à INTERNAL_ENTITY_SEEDS côté serveur.
// Utilisés par l'onboarding pour créer des entités avec des IDs prédéterminés,
// évitant les doublons quand init-internal-entities est exécuté après l'onboarding.
export const BASE_INTERNAL_ENTITY_SETUP = [
  {
    key: 'WEKNOW',
    name: 'WEKNOW',
    id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    key: 'DEVBYSTEP',
    name: 'DEVBYSTEP',
    id: '550e8400-e29b-41d4-a716-446655440002',
  },
  {
    key: 'ALLSENSIA',
    name: 'ALLSENSIA',
    id: '550e8400-e29b-41d4-a716-446655440003',
  },
  {
    key: 'ANGLE_INTELLIGENCE',
    name: 'ANGLE_INTELLIGENCE',
    id: '550e8400-e29b-41d4-a716-446655440004',
  },
] as const;
