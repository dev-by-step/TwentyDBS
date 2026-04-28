export type InternalEntitySeed = {
  id: string;
  name: string;
  color: string;
};

export const INTERNAL_ENTITY_SEEDS: Record<string, InternalEntitySeed> = {
  WEKNOW: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'WEKNOW',
    color: '#2563EB',
  },
  DEVBYSTEP: {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'DEVBYSTEP',
    color: '#16A34A',
  },
  ALLSENSIA: {
    id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'ALLSENSIA',
    color: '#D97706',
  },
  ANGLE_INTELLIGENCE: {
    id: '550e8400-e29b-41d4-a716-446655440004',
    name: 'ANGLE_INTELLIGENCE',
    color: '#7C3AED',
  },
};
