export type InternalEntitySeed = {
  id: string;
  name: string;
  color: string;
  aliases?: string[];
};

export const INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME = 'INTERNAL_ENTITY_SEEDS';

export const DEFAULT_INTERNAL_ENTITY_SEEDS: ReadonlyArray<InternalEntitySeed> =
  [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'WEKNOW',
      color: '#2563EB',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'DEVBYSTEP',
      color: '#16A34A',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      name: 'ALLSENSIA',
      color: '#D97706',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440004',
      name: 'ANGLE_INTELLIGENCE',
      color: '#7C3AED',
    },
  ];
