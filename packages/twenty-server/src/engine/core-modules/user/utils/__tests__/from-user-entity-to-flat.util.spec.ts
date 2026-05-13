import { fromUserEntityToFlat } from 'src/engine/core-modules/user/utils/from-user-entity-to-flat.util';
import { buildUserEntity } from 'src/engine/core-modules/user/utils/__tests__/factories/user-entity.factory';

describe('fromUserEntityToFlat', () => {
  it('should preserve the user internal entity id for auth context caching', () => {
    const user = buildUserEntity();

    const flatUser = fromUserEntityToFlat(user);

    expect(flatUser.entityId).toBe(user.entityId);
  });
});
