import { t } from '@lingui/core/macro';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import {
  StyledActions,
  StyledBackdrop,
  StyledDialog,
  StyledRightActions,
  StyledTitle,
} from '@/activities/group-calendar/components/GroupCalendarEventDialogStyles';
import {
  formatDateTimeInputValue,
  type GroupCalendarEventFormState,
  GroupCalendarEventFormFields,
} from '@/activities/group-calendar/components/GroupCalendarEventFormFields';
import {
  CALENDAR_EVENT_ENTITY_AUDIENCE_OBJECT_NAME,
  CALENDAR_EVENT_PERSON_AUDIENCE_OBJECT_NAME,
  CALENDAR_EVENT_SHARING_SCOPE_ENTITY_ONLY,
  CALENDAR_EVENT_SHARING_SCOPE_WORKSPACE_PUBLIC,
} from '@/activities/group-calendar/constants/CalendarEventAudience';
import {
  CalendarEventAudienceSyncError,
  useGroupCalendarEventAudienceSync,
} from '@/activities/group-calendar/hooks/useGroupCalendarEventAudienceSync';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';

type CalendarEventRecord = {
  __typename: string;
  id: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  sharingScope: string | null;
};

type CalendarEventEntityAudienceRow = {
  __typename: string;
  id: string;
  calendarEventId: string;
  internalEntityId: string;
};

type CalendarEventPersonAudienceRow = {
  __typename: string;
  id: string;
  calendarEventId: string;
  workspaceMemberId: string;
};

type GroupCalendarEditEventModalProps = {
  eventId: string;
  onClose: () => void;
  onSaved: () => Promise<unknown> | unknown;
  onDeleted: () => Promise<unknown> | unknown;
};

const DELETE_CALENDAR_EVENT_MODAL_ID =
  'group-calendar-delete-event-confirmation';

const emptyFormState: GroupCalendarEventFormState = {
  title: '',
  startsAt: '',
  endsAt: '',
  audienceMode: 'group',
  selectedAudienceEntityIds: [],
  selectedAudienceMemberIds: [],
};

export const GroupCalendarEditEventModal = ({
  eventId,
  onClose,
  onSaved,
  onDeleted,
}: GroupCalendarEditEventModalProps) => {
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { objectMetadataItems } = useObjectMetadataItems();
  const isAudienceFeatureAvailable = objectMetadataItems.some(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular ===
      CALENDAR_EVENT_ENTITY_AUDIENCE_OBJECT_NAME,
  );
  const isPersonAudienceFeatureAvailable = objectMetadataItems.some(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular ===
      CALENDAR_EVENT_PERSON_AUDIENCE_OBJECT_NAME,
  );

  const { record: calendarEvent, loading: eventLoading } =
    useFindOneRecord<CalendarEventRecord>({
      objectNameSingular: CoreObjectNameSingular.CalendarEvent,
      objectRecordId: eventId,
      recordGqlFields: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        sharingScope: true,
      },
    });

  const {
    records: existingEntityAudienceRows = [],
    loading: entityAudienceLoading,
  } = useFindManyRecords<CalendarEventEntityAudienceRow>({
    objectNameSingular: CALENDAR_EVENT_ENTITY_AUDIENCE_OBJECT_NAME,
    recordGqlFields: {
      id: true,
      calendarEventId: true,
      internalEntityId: true,
    },
    filter: { calendarEventId: { eq: eventId } },
    skip: !isAudienceFeatureAvailable,
  });

  const {
    records: existingPersonAudienceRows = [],
    loading: personAudienceLoading,
  } = useFindManyRecords<CalendarEventPersonAudienceRow>({
    objectNameSingular: CALENDAR_EVENT_PERSON_AUDIENCE_OBJECT_NAME,
    recordGqlFields: {
      id: true,
      calendarEventId: true,
      workspaceMemberId: true,
    },
    filter: { calendarEventId: { eq: eventId } },
    skip: !isPersonAudienceFeatureAvailable,
  });

  const [formState, setFormState] =
    useState<GroupCalendarEventFormState>(emptyFormState);
  // Tracks the eventId we already hydrated for. Reset hydration if the modal
  // is reused for a different event (currently the parent unmounts/remounts but
  // this keeps the contract explicit and survives future refactors).
  const hydratedForEventIdRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isHydrationDataReady =
    !eventLoading &&
    isDefined(calendarEvent) &&
    (!isAudienceFeatureAvailable || !entityAudienceLoading) &&
    (!isPersonAudienceFeatureAvailable || !personAudienceLoading);

  const isHydrated = hydratedForEventIdRef.current === eventId;

  const patchFormState = (patch: Partial<GroupCalendarEventFormState>) => {
    setFormState((previous) => ({ ...previous, ...patch }));
  };

  useEffect(() => {
    if (
      hydratedForEventIdRef.current === eventId ||
      !isHydrationDataReady ||
      !isDefined(calendarEvent)
    ) {
      return;
    }

    const initialEntityIds = existingEntityAudienceRows.map(
      (row) => row.internalEntityId,
    );
    const initialMemberIds = existingPersonAudienceRows.map(
      (row) => row.workspaceMemberId,
    );
    const hasAnyAudience =
      initialEntityIds.length > 0 || initialMemberIds.length > 0;

    setFormState({
      title: calendarEvent.title ?? '',
      startsAt: formatDateTimeInputValue(new Date(calendarEvent.startsAt)),
      endsAt: formatDateTimeInputValue(new Date(calendarEvent.endsAt)),
      audienceMode:
        calendarEvent.sharingScope ===
          CALENDAR_EVENT_SHARING_SCOPE_ENTITY_ONLY || hasAnyAudience
          ? 'specific'
          : 'group',
      selectedAudienceEntityIds: initialEntityIds,
      selectedAudienceMemberIds: initialMemberIds,
    });
    hydratedForEventIdRef.current = eventId;
  }, [
    eventId,
    isHydrationDataReady,
    calendarEvent,
    existingEntityAudienceRows,
    existingPersonAudienceRows,
  ]);

  const { updateOneRecord } = useUpdateOneRecord();
  const { deleteOneRecord: deleteCalendarEvent } = useDeleteOneRecord({
    objectNameSingular: CoreObjectNameSingular.CalendarEvent,
  });
  const { persistAudience, deleteAllAudienceRows } =
    useGroupCalendarEventAudienceSync({
      isAudienceFeatureAvailable,
      isPersonAudienceFeatureAvailable,
    });
  const { openModal } = useModal();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (
      isAudienceFeatureAvailable &&
      formState.audienceMode === 'specific' &&
      formState.selectedAudienceEntityIds.length === 0 &&
      formState.selectedAudienceMemberIds.length === 0
    ) {
      enqueueErrorSnackBar({
        message: t`Select at least one entity or person for the audience.`,
      });

      return;
    }

    setIsSaving(true);

    try {
      const sharingScope =
        !isAudienceFeatureAvailable || formState.audienceMode === 'group'
          ? CALENDAR_EVENT_SHARING_SCOPE_WORKSPACE_PUBLIC
          : CALENDAR_EVENT_SHARING_SCOPE_ENTITY_ONLY;

      await updateOneRecord({
        objectNameSingular: CoreObjectNameSingular.CalendarEvent,
        idToUpdate: eventId,
        updateOneRecordInput: {
          title: formState.title,
          startsAt: new Date(formState.startsAt).toISOString(),
          endsAt: new Date(formState.endsAt).toISOString(),
          sharingScope,
        },
      });

      await persistAudience({
        eventId,
        desiredEntityIds:
          formState.audienceMode === 'specific'
            ? formState.selectedAudienceEntityIds
            : [],
        desiredMemberIds:
          formState.audienceMode === 'specific'
            ? formState.selectedAudienceMemberIds
            : [],
        existingEntityRows: existingEntityAudienceRows,
        existingPersonRows: existingPersonAudienceRows,
      });

      enqueueSuccessSnackBar({ message: t`Event updated.` });
      await onSaved();
      onClose();
    } catch (error) {
      const message =
        error instanceof CalendarEventAudienceSyncError
          ? t`The event was saved but ${error.failedOperationCount} audience entry/entries failed to sync. Reopen the event to retry.`
          : error instanceof Error
            ? error.message
            : t`An error occurred.`;

      enqueueErrorSnackBar({ message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = () => {
    openModal(DELETE_CALENDAR_EVENT_MODAL_ID);
  };

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true);

    try {
      await deleteAllAudienceRows({
        existingEntityRows: existingEntityAudienceRows,
        existingPersonRows: existingPersonAudienceRows,
      });
      await deleteCalendarEvent(eventId);

      enqueueSuccessSnackBar({ message: t`Event deleted.` });
      await onDeleted();
      onClose();
    } catch (error) {
      enqueueErrorSnackBar({
        message: error instanceof Error ? error.message : t`An error occurred.`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (eventLoading || !isHydrated) {
    return null;
  }

  return (
    <>
    <StyledBackdrop>
      <StyledDialog onSubmit={handleSubmit}>
        <StyledTitle>{t`Edit event`}</StyledTitle>
        <GroupCalendarEventFormFields
          state={formState}
          onPatchState={patchFormState}
          isAudienceFeatureAvailable={isAudienceFeatureAvailable}
          isPersonAudienceFeatureAvailable={isPersonAudienceFeatureAvailable}
        />
        <StyledActions>
          <Button
            title={t`Delete`}
            variant="secondary"
            accent="danger"
            onClick={handleDeleteClick}
            disabled={isSaving || isDeleting}
          />
          <StyledRightActions>
            <Button
              title={t`Cancel`}
              variant="tertiary"
              onClick={onClose}
              disabled={isSaving || isDeleting}
            />
            <Button
              title={t`Save`}
              variant="secondary"
              type="submit"
              disabled={isSaving || isDeleting}
            />
          </StyledRightActions>
        </StyledActions>
      </StyledDialog>
    </StyledBackdrop>
    <ConfirmationModal
      modalInstanceId={DELETE_CALENDAR_EVENT_MODAL_ID}
      title={t`Delete this event?`}
      subtitle={t`This action cannot be undone. Audience memberships will be removed too.`}
      confirmButtonText={t`Delete`}
      confirmButtonAccent="danger"
      onConfirmClick={handleDeleteConfirmed}
      loading={isDeleting}
    />
    </>
  );
};
