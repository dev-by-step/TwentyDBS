import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isDefined } from 'twenty-shared/utils';

// Types et helpers PURS extraits de SuperadminWorkspaceSetup.tsx (IMP-15).
// Aucun état React ici : uniquement des transformations testables.

export type InternalEntityRecord = {
  __typename: string;
  id: string;
  name: string;
  color?: string | null;
};

export type WorkspaceMemberEntityMembershipRecord = {
  __typename: string;
  id: string;
  workspaceMemberId: string;
  internalEntityId: string;
};

export type SavedEntityState = {
  id?: string;
  name?: string;
  website?: string | null;
  headcount?: number | null;
  isMember?: boolean;
};

export type SavedSetupState = {
  entities?: SavedEntityState[];
  selectedObjectMetadataIds?: string[];
};

export type EntityDraft = {
  id?: string;
  name: string;
  website: string;
  headcount: string;
  isMember: boolean;
};

export type ModuleOption = {
  objectMetadataId: string;
  nameSingular: string;
  label: string;
};

export const STARTUP_MODULE_PRIORITY = [
  'workspaceMember',
  'person',
  'company',
  'opportunity',
  'task',
  'note',
  'project',
  'calendarEvent',
  'messageThread',
  'workflow',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseSavedSetupState = (
  value: unknown,
): SavedSetupState | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    entities: Array.isArray(value.entities)
      ? value.entities.filter(isRecord).map((entity) => ({
          id: typeof entity.id === 'string' ? entity.id : undefined,
          name: typeof entity.name === 'string' ? entity.name : undefined,
          website: typeof entity.website === 'string' ? entity.website : null,
          headcount:
            typeof entity.headcount === 'number' ? entity.headcount : null,
          isMember: entity.isMember === true,
        }))
      : undefined,
    selectedObjectMetadataIds: Array.isArray(value.selectedObjectMetadataIds)
      ? value.selectedObjectMetadataIds.filter(
          (objectMetadataId): objectMetadataId is string =>
            typeof objectMetadataId === 'string',
        )
      : undefined,
  };
};

export const resolveModuleOptions = (
  objectMetadataItems: EnrichedObjectMetadataItem[],
): ModuleOption[] => {
  const objectMetadataByName = new Map(
    objectMetadataItems.map((objectMetadataItem) => [
      objectMetadataItem.nameSingular,
      objectMetadataItem,
    ]),
  );

  return STARTUP_MODULE_PRIORITY.flatMap((objectName) => {
    const objectMetadataItem = objectMetadataByName.get(objectName);

    if (!isDefined(objectMetadataItem)) {
      return [];
    }

    return [
      {
        objectMetadataId: objectMetadataItem.id,
        nameSingular: objectMetadataItem.nameSingular,
        label:
          objectMetadataItem.nameSingular === 'workspaceMember'
            ? 'Team'
            : objectMetadataItem.labelPlural,
      },
    ];
  });
};
