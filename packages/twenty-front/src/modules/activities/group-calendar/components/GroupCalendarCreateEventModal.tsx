import { t } from '@lingui/core/macro';
import { addHours, startOfHour } from 'date-fns';
import { type FormEvent, useEffect, useState } from 'react';
import { v4 } from 'uuid';

import { type CalendarChannel } from '@/accounts/types/CalendarChannel';
import {
  StyledForm,
  StyledModalTitle,
} from '@/activities/group-calendar/components/GroupCalendarEventDialogStyles';
import {
  type GroupCalendarEventFormState,
  GroupCalendarEventFormFields,
} from '@/activities/group-calendar/components/GroupCalendarEventFormFields';
import {
  CALENDAR_CHANNEL_EVENT_ASSOCIATION_OBJECT_NAME,
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
  buildCreateInitialFormState,
  deriveSharingScopeFromAudienceMode,
  mergeEntityIds,
} from '@/activities/group-calendar/utils/groupCalendarFormUtils';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useMyCalendarChannels } from '@/settings/accounts/hooks/useMyCalendarChannels';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { ModalContent, ModalFooter, ModalHeader } from 'twenty-ui/layout';

type GroupCalendarCreateEventModalProps = {
  selectedDate: Date;
  onCreated: () => Promise<unknown> | unknown;
};

type GroupCalendarCreateEventModalContentProps =
  GroupCalendarCreateEventModalProps;

const buildInitialState = (selectedDate: Date): GroupCalendarEventFormState => {
  const defaultStart = startOfHour(addHours(selectedDate, 1));
  const defaultEnd = addHours(defaultStart, 1);

  return buildCreateInitialFormState({
    selectedDate,
    defaultEventEntityIds: [],
    defaultStart,
    defaultEnd,
  });
};

export const GroupCalendarCreateEventModal = ({
  selectedDate,
  onCreated,
}: GroupCalendarCreateEventModalProps) => {
  const isModalOpened = useAtomComponentStateValue(
    isModalOpenedComponentState,
    GROUP_CALENDAR_CONFIG.modalIds.createEvent,
  );

  return (
    <ModalStatefulWrapper
      modalInstanceId={GROUP_CALENDAR_CONFIG.modalIds.createEvent}
      size="medium"
      padding="none"
      isClosable
      autoHeight
      renderInDocumentBody
    >
      {isModalOpened && (
        <GroupCalendarCreateEventModalContent
          selectedDate={selectedDate}
          onCreated={onCreated}
        />
      )}
    </ModalStatefulWrapper>
  );
};

const GroupCalendarCreateEventModalContent = ({
  selectedDate,
  onCreated,
}: GroupCalendarCreateEventModalContentProps) => {
  const { channels, loading: calendarChannelsLoading } =
    useMyCalendarChannels();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { closeModal } = useModal();
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

  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const {
    manageableEventEntities,
    manageableEventEntityIds,
    primaryEventEntityId,
    isReady: manageableEntitiesReady,
  } = useManageableEventEntities();

  const [formState, setFormState] = useState<GroupCalendarEventFormState>(() =>
    buildInitialState(selectedDate),
  );
  const [calendarChannelId, setCalendarChannelId] = useState<string>('');
  const [hasPrefilledEventEntities, setHasPrefilledEventEntities] =
    useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Smart default: as soon as we know which entities the user can manage,
  // preselect ONLY the primary one (user.entityId when manageable, otherwise
  // the first manageable entity). The user adds other entities explicitly if
  // they want — we never silently broadcast the event to all of their entities.
  useEffect(() => {
    if (
      hasPrefilledEventEntities ||
      !manageableEntitiesReady ||
      !isDefined(primaryEventEntityId)
    ) {
      return;
    }

    setFormState((previous) => ({
      ...previous,
      eventEntityIds: [primaryEventEntityId],
    }));
    setHasPrefilledEventEntities(true);
  }, [
    hasPrefilledEventEntities,
    manageableEntitiesReady,
    primaryEventEntityId,
  ]);

  const patchFormState = (patch: Partial<GroupCalendarEventFormState>) => {
    setFormState((previous) => ({ ...previous, ...patch }));
  };

  const { createOneRecord: createCalendarEvent } = useCreateOneRecord({
    objectNameSingular: CoreObjectNameSingular.CalendarEvent,
    skipPostOptimisticEffect: true,
    recordGqlFields: {
      id: true,
      title: true,
    },
  });
  const { createOneRecord: createCalendarChannelEventAssociation } =
    useCreateOneRecord({
      objectNameSingular: CALENDAR_CHANNEL_EVENT_ASSOCIATION_OBJECT_NAME,
      skipPostOptimisticEffect: true,
      recordGqlFields: {
        id: true,
        calendarEventId: true,
        calendarChannelId: true,
      },
    });
  const { createOneRecord: createCalendarEventParticipant } =
    useCreateOneRecord({
      objectNameSingular: 'calendarEventParticipant',
      skipPostOptimisticEffect: true,
      recordGqlFields: {
        id: true,
        calendarEventId: true,
        workspaceMemberId: true,
      },
    });
  const { persistAudience } = useGroupCalendarEventAudienceSync({
    isAudienceFeatureAvailable,
    isPersonAudienceFeatureAvailable,
  });

  const selectedCalendarChannelId =
    calendarChannelId || channels[0]?.id || null;

  const handleClose = () => {
    closeModal(GROUP_CALENDAR_CONFIG.modalIds.createEvent);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isDefined(selectedCalendarChannelId)) {
      enqueueErrorSnackBar({
        message: t`No calendar channel is available for this account.`,
      });

      return;
    }

    if (formState.eventEntityIds.length === 0) {
      enqueueErrorSnackBar({
        message: t`Select at least one entity this event belongs to.`,
      });

      return;
    }

    if (
      formState.eventEntityIds.some(
        (entityId) => !manageableEventEntityIds.has(entityId),
      )
    ) {
      enqueueErrorSnackBar({
        message: t`You can only create events for entities you manage.`,
      });

      return;
    }

    setIsSaving(true);

    try {
      const sharingScope = deriveSharingScopeFromAudienceMode({
        audienceMode: formState.audienceMode,
        isAudienceFeatureAvailable,
      });

      const createdEvent = await createCalendarEvent({
        title: formState.title,
        isCanceled: false,
        isFullDay: false,
        startsAt: new Date(formState.startsAt).toISOString(),
        endsAt: new Date(formState.endsAt).toISOString(),
        externalCreatedAt: new Date().toISOString(),
        externalUpdatedAt: new Date().toISOString(),
        sharingScope,
      });

      // Calendar participant mutations are authorized from the event's channel
      // association, so the association must exist before the rest runs.
      await createCalendarChannelEventAssociation({
        calendarEventId: createdEvent.id,
        calendarChannelId: selectedCalendarChannelId,
        eventExternalId: `manual-${v4()}`,
        recurringEventExternalId: null,
      });

      const postCreateOperations: Promise<unknown>[] = [];

      if (isDefined(currentWorkspaceMember)) {
        postCreateOperations.push(
          createCalendarEventParticipant({
            calendarEventId: createdEvent.id,
            workspaceMemberId: currentWorkspaceMember.id,
            displayName:
              `${currentWorkspaceMember.name.firstName} ${currentWorkspaceMember.name.lastName}`.trim(),
            handle: currentWorkspaceMember.userEmail,
            isOrganizer: true,
            responseStatus: 'ACCEPTED',
          }),
        );
      }

      if (isAudienceFeatureAvailable) {
        const desiredEntityIds = mergeEntityIds(
          formState.eventEntityIds,
          formState.audienceMode === 'specific'
            ? formState.selectedAudienceEntityIds
            : [],
        );
        const desiredMemberIds =
          formState.audienceMode === 'specific'
            ? formState.selectedAudienceMemberIds
            : [];

        postCreateOperations.push(
          persistAudience({
            eventId: createdEvent.id,
            desiredEntityIds,
            desiredMemberIds,
          }),
        );
      }

      await Promise.all(postCreateOperations);

      enqueueSuccessSnackBar({ message: t`Event created.` });
      await onCreated();
      handleClose();
    } catch (error) {
      const message =
        error instanceof CalendarEventAudienceSyncError
          ? t`The event was created but ${error.failedOperationCount} audience entry/entries failed to save. You can retry from the event details.`
          : error instanceof Error
            ? error.message
            : t`An error occurred.`;

      enqueueErrorSnackBar({ message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledForm onSubmit={handleSubmit}>
      <ModalHeader hasBorderBottom>
        <StyledModalTitle>{t`New event`}</StyledModalTitle>
      </ModalHeader>
      <ModalContent contentPadding={5} gap={4}>
        <GroupCalendarEventFormFields
          state={formState}
          onPatchState={patchFormState}
          isAudienceFeatureAvailable={isAudienceFeatureAvailable}
          isPersonAudienceFeatureAvailable={isPersonAudienceFeatureAvailable}
          manageableEventEntities={manageableEventEntities}
          afterTitleField={
            <Select
              dropdownId="group-calendar-create-event-calendar-channel"
              label={t`Calendar`}
              disabled={calendarChannelsLoading || channels.length === 0}
              value={selectedCalendarChannelId ?? ''}
              onChange={(value) => setCalendarChannelId(value)}
              options={channels.map((channel: CalendarChannel) => ({
                label: channel.handle,
                value: channel.id,
              }))}
              fullWidth
            />
          }
        />
      </ModalContent>
      <ModalFooter>
        <Button
          title={t`Cancel`}
          variant="tertiary"
          type="button"
          onClick={handleClose}
          disabled={isSaving}
        />
        <Button
          title={t`Create`}
          variant="secondary"
          type="submit"
          disabled={
            isSaving ||
            !manageableEntitiesReady ||
            manageableEventEntities.length === 0 ||
            formState.eventEntityIds.length === 0
          }
        />
      </ModalFooter>
    </StyledForm>
  );
};
