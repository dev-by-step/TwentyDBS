import {
  CALENDAR_EVENT_ENTITY_AUDIENCE_OBJECT_NAME,
  CALENDAR_EVENT_PERSON_AUDIENCE_OBJECT_NAME,
} from '@/activities/group-calendar/constants/CalendarEventAudience';
import { useEntityMembersCoverage } from '@/activities/group-calendar/hooks/useEntityMembersCoverage';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';

export class CalendarEventAudienceSyncError extends Error {
  readonly failedOperationCount: number;

  constructor(failedOperationCount: number) {
    super(
      `Calendar event audience sync had ${failedOperationCount} failed operation(s).`,
    );
    this.failedOperationCount = failedOperationCount;
    this.name = 'CalendarEventAudienceSyncError';
  }
}

export type CalendarEventEntityAudienceRow = {
  id: string;
  internalEntityId: string;
};

export type CalendarEventPersonAudienceRow = {
  id: string;
  workspaceMemberId: string;
};

type PersistAudienceArgs = {
  eventId: string;
  desiredEntityIds: string[];
  desiredMemberIds: string[];
  existingEntityRows?: CalendarEventEntityAudienceRow[];
  existingPersonRows?: CalendarEventPersonAudienceRow[];
};

// Single primitive used by both Create (existing* empty → creates only) and
// Edit (existing* populated → diff/sync). Filters person rows already covered
// by the desired entities so we never persist a redundant row.
export const useGroupCalendarEventAudienceSync = ({
  isAudienceFeatureAvailable,
  isPersonAudienceFeatureAvailable,
}: {
  isAudienceFeatureAvailable: boolean;
  isPersonAudienceFeatureAvailable: boolean;
}) => {
  const { createOneRecord: createCalendarEventEntityAudience } =
    useCreateOneRecord({
      objectNameSingular: CALENDAR_EVENT_ENTITY_AUDIENCE_OBJECT_NAME,
      skipPostOptimisticEffect: true,
      recordGqlFields: {
        id: true,
        calendarEventId: true,
        internalEntityId: true,
      },
    });
  const { createOneRecord: createCalendarEventPersonAudience } =
    useCreateOneRecord({
      objectNameSingular: CALENDAR_EVENT_PERSON_AUDIENCE_OBJECT_NAME,
      skipPostOptimisticEffect: true,
      recordGqlFields: {
        id: true,
        calendarEventId: true,
        workspaceMemberId: true,
      },
    });
  const { deleteOneRecord: deleteEntityAudienceRow } = useDeleteOneRecord({
    objectNameSingular: CALENDAR_EVENT_ENTITY_AUDIENCE_OBJECT_NAME,
  });
  const { deleteOneRecord: deletePersonAudienceRow } = useDeleteOneRecord({
    objectNameSingular: CALENDAR_EVENT_PERSON_AUDIENCE_OBJECT_NAME,
  });
  const { isMemberCoveredBySelectedEntities } = useEntityMembersCoverage({
    skip: !isPersonAudienceFeatureAvailable,
  });

  const persistAudience = async ({
    eventId,
    desiredEntityIds,
    desiredMemberIds,
    existingEntityRows = [],
    existingPersonRows = [],
  }: PersistAudienceArgs): Promise<void> => {
    if (!isAudienceFeatureAvailable) {
      return;
    }

    const initialEntityIds = new Set(
      existingEntityRows.map((row) => row.internalEntityId),
    );
    const entitiesToAdd = desiredEntityIds.filter(
      (id) => !initialEntityIds.has(id),
    );
    const entityRowsToDelete = existingEntityRows.filter(
      (row) => !desiredEntityIds.includes(row.internalEntityId),
    );

    const filteredMemberIds = isPersonAudienceFeatureAvailable
      ? desiredMemberIds.filter(
          (memberId) =>
            !isMemberCoveredBySelectedEntities(memberId, desiredEntityIds),
        )
      : [];
    const initialMemberIds = new Set(
      existingPersonRows.map((row) => row.workspaceMemberId),
    );
    const membersToAdd = filteredMemberIds.filter(
      (id) => !initialMemberIds.has(id),
    );
    const memberRowsToDelete = existingPersonRows.filter(
      (row) => !filteredMemberIds.includes(row.workspaceMemberId),
    );

    const results = await Promise.allSettled([
      ...entitiesToAdd.map((entityId) =>
        createCalendarEventEntityAudience({
          calendarEventId: eventId,
          internalEntityId: entityId,
        }),
      ),
      ...entityRowsToDelete.map((row) => deleteEntityAudienceRow(row.id)),
      ...membersToAdd.map((memberId) =>
        createCalendarEventPersonAudience({
          calendarEventId: eventId,
          workspaceMemberId: memberId,
        }),
      ),
      ...memberRowsToDelete.map((row) => deletePersonAudienceRow(row.id)),
    ]);

    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (failures.length > 0) {
      throw new CalendarEventAudienceSyncError(failures.length);
    }
  };

  const deleteAllAudienceRows = async ({
    existingEntityRows = [],
    existingPersonRows = [],
  }: {
    existingEntityRows?: CalendarEventEntityAudienceRow[];
    existingPersonRows?: CalendarEventPersonAudienceRow[];
  }): Promise<void> => {
    if (!isAudienceFeatureAvailable) {
      return;
    }

    const results = await Promise.allSettled([
      ...existingEntityRows.map((row) => deleteEntityAudienceRow(row.id)),
      ...existingPersonRows.map((row) => deletePersonAudienceRow(row.id)),
    ]);

    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (failures.length > 0) {
      throw new CalendarEventAudienceSyncError(failures.length);
    }
  };

  return { persistAudience, deleteAllAudienceRows };
};
