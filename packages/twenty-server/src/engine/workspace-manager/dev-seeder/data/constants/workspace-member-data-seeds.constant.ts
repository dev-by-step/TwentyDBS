import {
  SEED_APPLE_WORKSPACE_ID,
  SEED_YCOMBINATOR_WORKSPACE_ID,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { PRIMARY_DEV_WORKSPACE_USERS } from 'src/engine/workspace-manager/dev-seeder/core/constants/primary-dev-workspace-data.constant';
import { generateRandomUsers } from 'src/engine/workspace-manager/dev-seeder/core/utils/generate-random-users.util';
import { USER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-users.util';

type WorkspaceMemberDataSeed = {
  id: string;
  nameFirstName: string;
  nameLastName: string;
  locale: string;
  colorScheme: string;
  userEmail: string;
  userId: string;
};

export const WORKSPACE_MEMBER_DATA_SEED_COLUMNS: (keyof WorkspaceMemberDataSeed)[] =
  [
    'id',
    'nameFirstName',
    'nameLastName',
    'locale',
    'colorScheme',
    'userEmail',
    'userId',
  ];

export const WORKSPACE_MEMBER_DATA_SEED_IDS = {
  TIM: '20202020-0687-4c41-b707-ed1bfca972a7',
  JONY: '20202020-77d5-4cb6-b60a-f4a835a85d61',
  PHIL: '20202020-1553-45c6-a028-5a9064cce07f',
  JANE: '20202020-463f-435b-828c-107e007a2711',
  LOUIS_WEKNOW: '20202020-cf8d-475d-a30e-5fba6df5c8fd',
};

const {
  workspaceMembers: randomWorkspaceMembers,
  workspaceMemberIds: randomWorkspaceMemberIds,
} = generateRandomUsers();

export const RANDOM_WORKSPACE_MEMBER_IDS = randomWorkspaceMemberIds;

const originalWorkspaceMembers: WorkspaceMemberDataSeed[] = [
  {
    id: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
    nameFirstName: PRIMARY_DEV_WORKSPACE_USERS.TIM.firstName,
    nameLastName: PRIMARY_DEV_WORKSPACE_USERS.TIM.lastName,
    locale: 'en',
    colorScheme: 'Light',
    userEmail: PRIMARY_DEV_WORKSPACE_USERS.TIM.email,
    userId: USER_DATA_SEED_IDS.TIM,
  },
  {
    id: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
    nameFirstName: PRIMARY_DEV_WORKSPACE_USERS.JONY.firstName,
    nameLastName: PRIMARY_DEV_WORKSPACE_USERS.JONY.lastName,
    locale: 'en',
    colorScheme: 'Light',
    userEmail: PRIMARY_DEV_WORKSPACE_USERS.JONY.email,
    userId: USER_DATA_SEED_IDS.JONY,
  },
  {
    id: WORKSPACE_MEMBER_DATA_SEED_IDS.PHIL,
    nameFirstName: PRIMARY_DEV_WORKSPACE_USERS.PHIL.firstName,
    nameLastName: PRIMARY_DEV_WORKSPACE_USERS.PHIL.lastName,
    locale: 'en',
    colorScheme: 'Light',
    userEmail: PRIMARY_DEV_WORKSPACE_USERS.PHIL.email,
    userId: USER_DATA_SEED_IDS.PHIL,
  },
  {
    id: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
    nameFirstName: PRIMARY_DEV_WORKSPACE_USERS.JANE.firstName,
    nameLastName: PRIMARY_DEV_WORKSPACE_USERS.JANE.lastName,
    locale: 'en',
    colorScheme: 'Light',
    userEmail: PRIMARY_DEV_WORKSPACE_USERS.JANE.email,
    userId: USER_DATA_SEED_IDS.JANE,
  },
  {
    id: WORKSPACE_MEMBER_DATA_SEED_IDS.LOUIS_WEKNOW,
    nameFirstName: PRIMARY_DEV_WORKSPACE_USERS.LOUIS_WEKNOW.firstName,
    nameLastName: PRIMARY_DEV_WORKSPACE_USERS.LOUIS_WEKNOW.lastName,
    locale: 'en',
    colorScheme: 'Light',
    userEmail: PRIMARY_DEV_WORKSPACE_USERS.LOUIS_WEKNOW.email,
    userId: USER_DATA_SEED_IDS.LOUIS_WEKNOW,
  },
];

export const WORKSPACE_MEMBER_DATA_SEEDS: WorkspaceMemberDataSeed[] = [
  ...originalWorkspaceMembers,
  ...randomWorkspaceMembers,
];

export const getWorkspaceMemberDataSeeds = (
  workspaceId: string,
): WorkspaceMemberDataSeed[] => {
  // In test environment, only return original members to avoid conflicts
  if (process.env.NODE_ENV === 'test') {
    return originalWorkspaceMembers;
  }

  if (workspaceId === SEED_APPLE_WORKSPACE_ID) {
    return originalWorkspaceMembers;
  } else if (workspaceId === SEED_YCOMBINATOR_WORKSPACE_ID) {
    // YC workspace gets all 4 original workspace members
    return originalWorkspaceMembers;
  }

  return originalWorkspaceMembers;
};
