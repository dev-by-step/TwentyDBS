import {
  PRIMARY_DEV_WORKSPACE_SHARED_HANDLES,
  PRIMARY_DEV_WORKSPACE_USERS,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/primary-dev-workspace-data.constant';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

type ConnectedAccountDataSeed = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  lastSyncHistoryId: string;
  accountOwnerId: string;
  refreshToken: string;
  accessToken: string;
  provider: string;
  handle: string;
};

export const CONNECTED_ACCOUNT_DATA_SEED_COLUMNS: (keyof ConnectedAccountDataSeed)[] =
  [
    'id',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'lastSyncHistoryId',
    'accountOwnerId',
    'refreshToken',
    'accessToken',
    'provider',
    'handle',
  ];

export const CONNECTED_ACCOUNT_DATA_SEED_IDS = {
  TIM: '20202020-9ac0-4390-9a1a-ab4d2c4e1bb7',
  JONY: '20202020-0cc8-4d60-a3a4-803245698908',
  PHIL: '20202020-cafc-4323-908d-e5b42ad69fdf',
  JANE: '20202020-b5c7-46f0-bf5c-3f4e4b3f7c1a',
  JANE_DELETABLE: '20202020-d1e5-4a8f-9c3b-7f6d5e4c3b2a',
};

export const CONNECTED_ACCOUNT_DATA_SEEDS: ConnectedAccountDataSeed[] = [
  {
    id: CONNECTED_ACCOUNT_DATA_SEED_IDS.TIM,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastSyncHistoryId: 'exampleLastSyncHistory',
    accountOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
    refreshToken: 'exampleRefreshToken',
    accessToken: 'exampleAccessToken',
    provider: 'google',
    handle: PRIMARY_DEV_WORKSPACE_USERS.TIM.email,
  },
  {
    id: CONNECTED_ACCOUNT_DATA_SEED_IDS.JONY,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastSyncHistoryId: 'exampleLastSyncHistory',
    accountOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
    refreshToken: 'exampleRefreshToken',
    accessToken: 'exampleAccessToken',
    provider: 'google',
    handle: PRIMARY_DEV_WORKSPACE_USERS.JONY.email,
  },
  {
    id: CONNECTED_ACCOUNT_DATA_SEED_IDS.PHIL,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastSyncHistoryId: 'exampleLastSyncHistory',
    accountOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.PHIL,
    refreshToken: 'exampleRefreshToken',
    accessToken: 'exampleAccessToken',
    provider: 'google',
    handle: PRIMARY_DEV_WORKSPACE_USERS.PHIL.email,
  },
  {
    id: CONNECTED_ACCOUNT_DATA_SEED_IDS.JANE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastSyncHistoryId: 'exampleLastSyncHistory',
    accountOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
    refreshToken: 'exampleRefreshToken',
    accessToken: 'exampleAccessToken',
    provider: 'google',
    handle: PRIMARY_DEV_WORKSPACE_USERS.JANE.email,
  },
  {
    id: CONNECTED_ACCOUNT_DATA_SEED_IDS.JANE_DELETABLE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastSyncHistoryId: 'exampleLastSyncHistory',
    accountOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
    refreshToken: 'exampleRefreshToken',
    accessToken: 'exampleAccessToken',
    provider: 'google',
    handle: PRIMARY_DEV_WORKSPACE_SHARED_HANDLES.ARCHIVE,
  },
];
