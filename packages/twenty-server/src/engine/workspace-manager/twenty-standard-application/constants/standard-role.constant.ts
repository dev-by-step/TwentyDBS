type StandardRoleDefinition = {
  universalIdentifier: string;
  label?: string;
  description?: string;
  icon?: string;
};

export const STANDARD_ROLE = {
  admin: { universalIdentifier: '20202020-02c2-43f2-b94d-cab1f2b532eb' },
  entityManager: {
    universalIdentifier: '20202020-7db7-47b4-95d2-13ec6f1c84b3',
    label: 'Entity Manager',
    description:
      'Can manage records, assignments, and shared calendar actions within its internal entity.',
    icon: 'IconBuildingSkyscraper',
  },
} as const satisfies Record<string, StandardRoleDefinition>;
