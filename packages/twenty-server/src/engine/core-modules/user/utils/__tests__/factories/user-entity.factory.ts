import { faker } from '@faker-js/faker';

import { type UserEntity } from 'src/engine/core-modules/user/user.entity';

export const buildUserEntity = (
  overrides: Partial<UserEntity> = {},
): UserEntity => {
  const date = new Date();

  return {
    id: faker.string.uuid(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    defaultAvatarUrl: null,
    entityId: faker.string.uuid(),
    isEmailVerified: true,
    disabled: false,
    canImpersonate: false,
    canAccessFullAdminPanel: false,
    locale: 'en',
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
    ...overrides,
  } as UserEntity;
};
