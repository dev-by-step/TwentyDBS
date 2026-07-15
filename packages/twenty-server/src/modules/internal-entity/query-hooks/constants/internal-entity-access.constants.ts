import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

export const ENTITY_MANAGER_ROLE_LABEL = STANDARD_ROLE.entityManager.label;

export const ENTITY_SCOPED_CRM_OBJECT_NAMES = [
  'company',
  'opportunity',
  'person',
] as const;

export const ENTITY_CONFIGURATION_OBJECT_NAMES = [
  'companyEntityMembership',
  'internalEntity',
  'personEntityMembership',
] as const;

export const PERSONAL_WORK_OBJECT_NAMES = [
  'attachment',
  'note',
  'noteTarget',
  'task',
  'taskTarget',
] as const;

export const HYBRID_SCOPED_OBJECT_NAMES = ['timelineActivity'] as const;

export const ENTITY_SCOPED_OBJECT_NAMES = [
  ...ENTITY_SCOPED_CRM_OBJECT_NAMES,
  ...ENTITY_CONFIGURATION_OBJECT_NAMES,
] as const;

export const ENTITY_SCOPED_OBJECT_NAME_SET = new Set<string>(
  ENTITY_SCOPED_OBJECT_NAMES,
);

export const ENTITY_CONFIGURATION_OBJECT_NAME_SET = new Set<string>(
  ENTITY_CONFIGURATION_OBJECT_NAMES,
);

export const ENTITY_SCOPED_CRM_OBJECT_NAME_SET = new Set<string>(
  ENTITY_SCOPED_CRM_OBJECT_NAMES,
);

export const PERSONAL_WORK_OBJECT_NAME_SET = new Set<string>(
  PERSONAL_WORK_OBJECT_NAMES,
);

export const HYBRID_SCOPED_OBJECT_NAME_SET = new Set<string>(
  HYBRID_SCOPED_OBJECT_NAMES,
);
