import { type ObjectRecord } from 'twenty-shared/types';

export type InternalEntitySourceTargetObjectName =
  | 'person'
  | 'company'
  | 'opportunity';

export type InternalEntityMembershipConfig = {
  membershipObjectName: string;
  sourceJoinColumnName: string;
};

export type InternalEntitySourceTaggableRecordInput = Partial<ObjectRecord>;
