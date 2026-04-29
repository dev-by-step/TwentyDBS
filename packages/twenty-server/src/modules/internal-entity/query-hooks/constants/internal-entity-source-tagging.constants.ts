import {
  type InternalEntityMembershipConfig,
  type InternalEntitySourceTargetObjectName,
} from 'src/modules/internal-entity/query-hooks/types/internal-entity-source-tagging.type';

export const INTERNAL_ENTITY_OBJECT_NAME = 'internalEntity';
export const OPPORTUNITY_OBJECT_NAME = 'opportunity';

export const INTERNAL_ENTITY_SOURCE_TARGET_OBJECT_NAMES = [
  'person',
  'company',
  OPPORTUNITY_OBJECT_NAME,
] as const;

export const INTERNAL_ENTITY_SOURCE_MEMBERSHIP_CONFIG_BY_OBJECT_NAME = {
  person: {
    membershipObjectName: 'personEntityMembership',
    sourceJoinColumnName: 'personId',
  },
  company: {
    membershipObjectName: 'companyEntityMembership',
    sourceJoinColumnName: 'companyId',
  },
} as const satisfies Partial<
  Record<InternalEntitySourceTargetObjectName, InternalEntityMembershipConfig>
>;

export const INTERNAL_ENTITY_SOURCE_TAGGING_QUERY_OPTIONS = {
  // Source-tagging hooks write system-managed relation rows after the user/entity authorization check.
  shouldBypassPermissionChecks: true,
} as const;
