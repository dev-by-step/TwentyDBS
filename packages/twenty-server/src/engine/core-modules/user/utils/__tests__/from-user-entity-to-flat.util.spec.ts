import { fromUserEntityToFlat } from 'src/engine/core-modules/user/utils/from-user-entity-to-flat.util';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';

const INTERNAL_ENTITY_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('fromUserEntityToFlat', () => {
  it('should preserve the user internal entity id for auth context caching', () => {
    const date = new Date('2026-04-29T10:00:00.000Z');

    const flatUser = fromUserEntityToFlat({
      id: 'user-id',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      defaultAvatarUrl: null,
      entityId: INTERNAL_ENTITY_ID,
      isEmailVerified: true,
      disabled: false,
      canImpersonate: false,
      canAccessFullAdminPanel: false,
      locale: 'en',
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
    } as unknown as UserEntity);

    expect(flatUser.entityId).toBe(INTERNAL_ENTITY_ID);
  });
});
