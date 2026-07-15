import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';

export const PRIMARY_DEV_WORKSPACE_DOMAIN = 'twenty-dbs.dev';

export const PRIMARY_DEV_WORKSPACE_DEFAULT_SIGN_IN = {
  email: 'aline@weknow.dev',
  password: 'twenty-dbs.dev',
} as const;

export const PRIMARY_DEV_WORKSPACE_DEFAULT_PASSWORD_HASH =
  '$2a$10$bbOfFNFkcBPpcELErcGU6e9ppxlafBR3CeIahthAEoGpoOpc5gxE2';

type PrimaryDevWorkspaceUser = {
  firstName: string;
  lastName: string;
  email: string;
  entityId: string;
  internalEntityIds: readonly string[];
  canImpersonate: boolean;
  canAccessFullAdminPanel: boolean;
};

export const PRIMARY_DEV_WORKSPACE_USERS = {
  TIM: {
    firstName: 'Louis',
    lastName: 'Viard',
    email: 'louis@devbystep.dev',
    entityId: INTERNAL_ENTITY_SEEDS.DEVBYSTEP.id,
    internalEntityIds: [
      INTERNAL_ENTITY_SEEDS.DEVBYSTEP.id,
      INTERNAL_ENTITY_SEEDS.WEKNOW.id,
      INTERNAL_ENTITY_SEEDS.ALLSENSIA.id,
    ],
    canImpersonate: false,
    canAccessFullAdminPanel: false,
  },
  JONY: {
    firstName: 'Aline',
    lastName: 'Caquineau',
    email: 'aline@weknow.dev',
    entityId: INTERNAL_ENTITY_SEEDS.WEKNOW.id,
    internalEntityIds: [
      INTERNAL_ENTITY_SEEDS.WEKNOW.id,
      INTERNAL_ENTITY_SEEDS.DEVBYSTEP.id,
      INTERNAL_ENTITY_SEEDS.ALLSENSIA.id,
    ],
    canImpersonate: true,
    canAccessFullAdminPanel: true,
  },
  PHIL: {
    firstName: 'Louis',
    lastName: 'Viard',
    email: 'louis@allsensia.dev',
    entityId: INTERNAL_ENTITY_SEEDS.ALLSENSIA.id,
    internalEntityIds: [INTERNAL_ENTITY_SEEDS.ALLSENSIA.id],
    canImpersonate: false,
    canAccessFullAdminPanel: false,
  },
  JANE: {
    firstName: 'Stephane',
    lastName: 'Langlet',
    email: 'stephane@angle-intelligence.dev',
    entityId: INTERNAL_ENTITY_SEEDS.ANGLE_INTELLIGENCE.id,
    internalEntityIds: [
      INTERNAL_ENTITY_SEEDS.ANGLE_INTELLIGENCE.id,
      INTERNAL_ENTITY_SEEDS.WEKNOW.id,
      INTERNAL_ENTITY_SEEDS.ALLSENSIA.id,
    ],
    canImpersonate: false,
    canAccessFullAdminPanel: false,
  },
  LOUIS_WEKNOW: {
    firstName: 'Louis',
    lastName: 'Viard',
    email: 'louis@weknow.dev',
    entityId: INTERNAL_ENTITY_SEEDS.WEKNOW.id,
    internalEntityIds: [
      INTERNAL_ENTITY_SEEDS.WEKNOW.id,
      INTERNAL_ENTITY_SEEDS.DEVBYSTEP.id,
      INTERNAL_ENTITY_SEEDS.ALLSENSIA.id,
    ],
    canImpersonate: false,
    canAccessFullAdminPanel: false,
  },
} as const satisfies Record<string, PrimaryDevWorkspaceUser>;

export type PrimaryDevWorkspaceUserKey =
  keyof typeof PRIMARY_DEV_WORKSPACE_USERS;

export const PRIMARY_DEV_WORKSPACE_SHARED_HANDLES = {
  CONTACT: `contact@${PRIMARY_DEV_WORKSPACE_DOMAIN}`,
  SALES: `sales@${PRIMARY_DEV_WORKSPACE_DOMAIN}`,
  LEADERSHIP: `direction@${PRIMARY_DEV_WORKSPACE_DOMAIN}`,
  TEAM_CALENDAR: `planning@${PRIMARY_DEV_WORKSPACE_DOMAIN}`,
  ARCHIVE: 'stephane.archive@angle-intelligence.dev',
} as const;

export const getPrimaryDevWorkspaceUserDisplayName = (
  key: PrimaryDevWorkspaceUserKey,
) => {
  const user = PRIMARY_DEV_WORKSPACE_USERS[key];

  return `${user.firstName} ${user.lastName}`;
};
