import { faker } from '@faker-js/faker';

import { fromUserEntityToFlat } from 'src/engine/core-modules/user/utils/from-user-entity-to-flat.util';
import { buildUserEntity } from 'src/engine/core-modules/user/utils/__tests__/factories/user-entity.factory';

describe('fromUserEntityToFlat', () => {
  it('should preserve the user internal entity id for auth context caching', () => {
    const entityId = faker.string.uuid();
    const user = buildUserEntity({ entityId });

    const flatUser = fromUserEntityToFlat(user);

    expect(flatUser.entityId).toBe(entityId);
  });
});
