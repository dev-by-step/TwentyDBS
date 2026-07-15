import { type QueryRunner } from 'typeorm';

import {
  PRIMARY_DEV_WORKSPACE_DEFAULT_PASSWORD_HASH,
  PRIMARY_DEV_WORKSPACE_USERS,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/primary-dev-workspace-data.constant';

import { generateRandomUsers } from './generate-random-users.util';

const tableName = 'user';

export const USER_DATA_SEED_IDS = {
  JANE: '20202020-e6b5-4680-8a32-b8209737156b',
  TIM: '20202020-9e3b-46d4-a556-88b9ddc2b034',
  JONY: '20202020-3957-4908-9c36-2929a23f8357',
  PHIL: '20202020-7169-42cf-bc47-1cfef15264b8',
  LOUIS_WEKNOW: '20202020-4a1e-4dfc-b8ca-41c2fe6a94a1',
};

const { users: randomUsers, userIds: randomUserIds } = generateRandomUsers();

export const RANDOM_USER_IDS = randomUserIds;

type SeedUsersArgs = {
  queryRunner: QueryRunner;
  schemaName: string;
  light?: boolean;
};

export const seedUsers = async ({
  queryRunner,
  schemaName,
  light = false,
}: SeedUsersArgs) => {
  const originalUsers = [
    {
      id: USER_DATA_SEED_IDS.TIM,
      ...PRIMARY_DEV_WORKSPACE_USERS.TIM,
      passwordHash: PRIMARY_DEV_WORKSPACE_DEFAULT_PASSWORD_HASH,
      isEmailVerified: true,
    },
    {
      id: USER_DATA_SEED_IDS.JONY,
      ...PRIMARY_DEV_WORKSPACE_USERS.JONY,
      passwordHash: PRIMARY_DEV_WORKSPACE_DEFAULT_PASSWORD_HASH,
      isEmailVerified: true,
    },
    {
      id: USER_DATA_SEED_IDS.PHIL,
      ...PRIMARY_DEV_WORKSPACE_USERS.PHIL,
      passwordHash: PRIMARY_DEV_WORKSPACE_DEFAULT_PASSWORD_HASH,
      isEmailVerified: true,
    },
    {
      id: USER_DATA_SEED_IDS.JANE,
      ...PRIMARY_DEV_WORKSPACE_USERS.JANE,
      passwordHash: PRIMARY_DEV_WORKSPACE_DEFAULT_PASSWORD_HASH,
      isEmailVerified: true,
    },
    {
      id: USER_DATA_SEED_IDS.LOUIS_WEKNOW,
      ...PRIMARY_DEV_WORKSPACE_USERS.LOUIS_WEKNOW,
      passwordHash: PRIMARY_DEV_WORKSPACE_DEFAULT_PASSWORD_HASH,
      isEmailVerified: true,
    },
  ];

  const allUsers = light ? originalUsers : [...originalUsers, ...randomUsers];

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.${tableName}`, [
      'id',
      'firstName',
      'lastName',
      'email',
      'entityId',
      'passwordHash',
      'canImpersonate',
      'canAccessFullAdminPanel',
      'isEmailVerified',
    ])
    .orIgnore()
    .values(allUsers)
    .execute();
};
