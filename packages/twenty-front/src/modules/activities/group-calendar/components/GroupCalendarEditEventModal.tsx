import { t } from '@lingui/core/macro';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import {
  StyledDeleteAction,
  StyledForm,
  StyledModalTitle,
} from '@/activities/group-calendar/components/GroupCalendarEventDialogStyles';
import {
  type GroupCalendarEventFormState,
  GroupCalendarEventFormFields,
} from '@/activities/group-calendar/components/GroupCalendarEventFormFields';
import {
  CALENDAR_EVENT_ENTITY_AUDIENCE_OBJECT_NAME,
  CALENDAR_EVENT_PERSON_AUDIENCE_OBJECT_NAME,
} from '@/activities/group-calendar/constants/CalendarEventAudience';
import { GROUP_CALENDAR_CONFIG } from '@/activities/group-calendar/constants/GroupCalendar';
import {
  CalendarEventAudienceSyncError,
  useGroupCalendarEventAudienceSync,
} from '@/activities/group-calendar/hooks/useGroupCalendarEventAudienceSync';
import { useManageableEventEntities } from '@/activities/group-calendar/hooks/useManageableEventEntities';
import {
  buildEditInitialFormState,
  deriveSharingScopeFromAudienceMode,
  mergeEntityIds,
} from '@/activities/group-calendar/utils/groupCalendarFormUtils';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { ModalContent, ModalFooter, ModalHeader } from 'twenty-ui/layout';

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

const emptyFormState: GroupCalendarEventFormState = {
  title: '',
  startsAt: '',
  endsAt: '',
  eventEntityIds: [],
  audienceMode: 'specific',
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

  const {
    manageableEventEntities,
    manageableEventEntityIds,
    isReady: manageableEntitiesReady,
  } = useManageableEventEntities();

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
    limit: GROUP_CALENDAR_CONFIG.limits.eventAudience,
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
    limit: GROUP_CALENDAR_CONFIG.limits.eventAudience,
    skip: !isPersonAudienceFeatureAvailable,
  });

  const [formState, setFormState] =
    useState<GroupCalendarEventFormState>(emptyFormState);
  // Tracks the eventId we already hydrated for. Reset hydration if the modal
  // is reused for a different event (currently the parent unmounts/remounts but
  // this keeps the contract explicit and survives future refactors).
  // oxlint-disable-next-line twenty/no-state-useref
  const hydratedForEventIdRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isHydrationDataReady =
    !eventLoading &&
    isDefined(calendarEvent) &&
    manageableEntitiesReady &&
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

    setFormState(
      buildEditInitialFormState({
        calendarEvent,
        entityAudienceRows: existingEntityAudienceRows,
        personAudienceRows: existingPersonAudienceRows,
        manageableEventEntityIds,
      }),
    );
    hydratedForEventIdRef.current = eventId;
  }, [
    eventId,
    isHydrationDataReady,
    calendarEvent,
    existingEntityAudienceRows,
    existingPersonAudienceRows,
    manageableEventEntityIds,
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
  const { closeModal, openModal } = useModal();

  useEffect(() => {
    openModal(GROUP_CALENDAR_CONFIG.modalIds.editEvent);

    return () => {
      closeModal(GROUP_CALENDAR_CONFIG.modalIds.editEvent);
    };
  }, [closeModal, openModal]);

  const handleClose = () => {
    closeModal(GROUP_CALENDAR_CONFIG.modalIds.editEvent);
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (
      formState.audienceMode === 'specific' &&
      formState.eventEntityIds.length === 0
    ) {
      enqueueErrorSnackBar({
        message: t`Select at least one entity this event belongs to.`,
      });

      return;
    }

    setIsSaving(true);

    try {
      const sharingScope = deriveSharingScopeFromAudienceMode({
        audienceMode: formState.audienceMode,
        isAudienceFeatureAvailable,
      });

      // Updating the event fields and syncing its audience are independent.
      const saveOperations: Promise<unknown>[] = [
        updateOneRecord({
          objectNameSingular: CoreObjectNameSingular.CalendarEvent,
          idToUpdate: eventId,
          updateOneRecordInput: {
            title: formState.title,
            startsAt: new Date(formState.startsAt).toISOString(),
            endsAt: new Date(formState.endsAt).toISOString(),
            sharingScope,
          },
        }),
      ];

      if (isAudienceFeatureAvailable) {
        const desiredEntityIds =
          formState.audienceMode === 'specific'
            ? mergeEntityIds(
                formState.eventEntityIds,
                formState.selectedAudienceEntityIds,
              )
            : [];
        const desiredMemberIds =
          formState.audienceMode === 'specific'
            ? formState.selectedAudienceMemberIds
            : [];

        saveOperations.push(
          persistAudience({
            eventId,
            desiredEntityIds,
            desiredMemberIds,
            existingEntityRows: existingEntityAudienceRows,
            existingPersonRows: existingPersonAudienceRows,
          }),
        );
      }

      await Promise.all(saveOperations);

      enqueueSuccessSnackBar({ message: t`Event updated.` });
      await onSaved();
      handleClose();
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
    openModal(GROUP_CALENDAR_CONFIG.modalIds.deleteEvent);
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
      handleClose();
    } catch (error) {
      enqueueErrorSnackBar({
        message: error instanceof Error ? error.message : t`An error occurred.`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const shouldRenderForm = !eventLoading && isHydrated;

  return (
    <>
      <ModalStatefulWrapper
        modalInstanceId={GROUP_CALENDAR_CONFIG.modalIds.editEvent}
        size="medium"
        padding="none"
        isClosable
        autoHeight
        renderInDocumentBody
        onClose={onClose}
      >
        {shouldRenderForm && (
          <StyledForm onSubmit={handleSubmit}>
            <ModalHeader hasBorderBottom>
              <StyledModalTitle>{t`Edit event`}</StyledModalTitle>
            </ModalHeader>
            <ModalContent contentPadding={5} gap={4}>
              <GroupCalendarEventFormFields
                state={formState}
                onPatchState={patchFormState}
                isAudienceFeatureAvailable={isAudienceFeatureAvailable}
                isPersonAudienceFeatureAvailable={
                  isPersonAudienceFeatureAvailable
                }
                manageableEventEntities={manageableEventEntities}
                eventEntitiesEmptyHint={t`You don't manage any entity that owns this event — only audience grants you control are editable.`}
              />
            </ModalContent>
            <ModalFooter>
              <StyledDeleteAction>
                <Button
                  title={t`Delete`}
                  variant="secondary"
                  accent="danger"
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={isSaving || isDeleting}
                />
              </StyledDeleteAction>
              <Button
                title={t`Cancel`}
                variant="tertiary"
                type="button"
                onClick={handleClose}
                disabled={isSaving || isDeleting}
              />
              <Button
                title={t`Save`}
                variant="secondary"
                type="submit"
                disabled={
                  isSaving ||
                  isDeleting ||
                  (formState.audienceMode === 'specific' &&
                    formState.eventEntityIds.length === 0 &&
                    manageableEventEntities.length > 0)
                }
              />
            </ModalFooter>
          </StyledForm>
        )}
      </ModalStatefulWrapper>
      <ConfirmationModal
        modalInstanceId={GROUP_CALENDAR_CONFIG.modalIds.deleteEvent}
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
