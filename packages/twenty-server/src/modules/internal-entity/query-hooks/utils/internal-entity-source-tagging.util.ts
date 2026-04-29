import { isDefined } from 'twenty-shared/utils';

import {
  INTERNAL_ENTITY_SOURCE_MEMBERSHIP_CONFIG_BY_OBJECT_NAME,
  INTERNAL_ENTITY_SOURCE_TARGET_OBJECT_NAMES,
} from 'src/modules/internal-entity/query-hooks/constants/internal-entity-source-tagging.constants';
import {
  type InternalEntityMembershipConfig,
  type InternalEntitySourceTargetObjectName,
} from 'src/modules/internal-entity/query-hooks/types/internal-entity-source-tagging.type';

export const isInternalEntitySourceTargetObjectName = (
  objectName: string,
): objectName is InternalEntitySourceTargetObjectName =>
  INTERNAL_ENTITY_SOURCE_TARGET_OBJECT_NAMES.includes(
    objectName as InternalEntitySourceTargetObjectName,
  );

export const getInternalEntityMembershipConfig = (
  objectName: string,
): InternalEntityMembershipConfig | null => {
  const config =
    INTERNAL_ENTITY_SOURCE_MEMBERSHIP_CONFIG_BY_OBJECT_NAME[
      objectName as keyof typeof INTERNAL_ENTITY_SOURCE_MEMBERSHIP_CONFIG_BY_OBJECT_NAME
    ];

  return isDefined(config) ? config : null;
};
