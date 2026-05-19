import { t } from '@lingui/core/macro';
import { addHours, startOfHour } from 'date-fns';
import { type FormEvent, useState } from 'react';
import { v4 } from 'uuid';

import { type CalendarChannel } from '@/accounts/types/CalendarChannel';
import {
  StyledActions,
  StyledBackdrop,
  StyledDialog,
  StyledField,
  StyledRightActions,
  StyledSelect,
  StyledTitle,
} from '@/activities/group-calendar/components/GroupCalendarEventDialogStyles';
import {
  formatDateTimeInputValue,
  type GroupCalendarEventFormState,
  GroupCalendarEventFormFields,
} from '@/activities/group-calendar/components/GroupCalendarEventFormFields';
import {
  CALENDAR_CHANNEL_EVENT_ASSOCIATION_OBJECT_NAME,
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
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useMyCalendarChannels } from '@/settings/accounts/hooks/useMyCalendarChannels';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';

type GroupCalendarCreateEventModalProps = {
  selectedDate: Date;
  onClose: () => void;
  onCreated: () => Promise<unknown> | unknown;
};

const buildInitialState = (selectedDate: Date): GroupCalendarEventFormState => {
  const defaultStart = startOfHour(addHours(selectedDate, 1));
  const defaultEnd = addHours(defaultStart, 1);

  return {
    title: '',
    startsAt: formatDateTimeInputValue(defaultStart),
    endsAt: formatDateTimeInputValue(defaultEnd),
    audienceMode: 'group',
    selectedAudienceEntityIds: [],
    selectedAudienceMemberIds: [],
  };
};

export const GroupCalendarCreateEventModal = ({
  selectedDate,
  onClose,
  onCreated,
}: GroupCalendarCreateEventModalProps) => {
  const { channels, loading: calendarChannelsLoading } =
    useMyCalendarChannels();
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

  const [formState, setFormState] = useState<GroupCalendarEventFormState>(() =>
    buildInitialState(selectedDate),
  );
  const [calendarChannelId, setCalendarChannelId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

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
  const { persistAudience } = useGroupCalendarEventAudienceSync({
    isAudienceFeatureAvailable,
    isPersonAudienceFeatureAvailable,
  });

  const selectedCalendarChannelId =
    calendarChannelId || channels[0]?.id || null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isDefined(selectedCalendarChannelId)) {
      enqueueErrorSnackBar({
        message: t`No calendar channel is available for this account.`,
      });

      return;
    }

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

      await createCalendarChannelEventAssociation({
        calendarEventId: createdEvent.id,
        calendarChannelId: selectedCalendarChannelId,
        eventExternalId: `manual-${v4()}`,
        recurringEventExternalId: null,
      });

      if (formState.audienceMode === 'specific') {
        await persistAudience({
          eventId: createdEvent.id,
          desiredEntityIds: formState.selectedAudienceEntityIds,
          desiredMemberIds: formState.selectedAudienceMemberIds,
        });
      }

      enqueueSuccessSnackBar({ message: t`Event created.` });
      await onCreated();
      onClose();
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
    <StyledBackdrop>
      <StyledDialog onSubmit={handleSubmit}>
        <StyledTitle>{t`New event`}</StyledTitle>
        <GroupCalendarEventFormFields
          state={formState}
          onPatchState={patchFormState}
          isAudienceFeatureAvailable={isAudienceFeatureAvailable}
          isPersonAudienceFeatureAvailable={isPersonAudienceFeatureAvailable}
          afterTitleField={
            <StyledField>
              {t`Calendar`}
              <StyledSelect
                disabled={calendarChannelsLoading || channels.length === 0}
                value={selectedCalendarChannelId ?? ''}
                onChange={(event) => setCalendarChannelId(event.target.value)}
                required
              >
                {channels.map((channel: CalendarChannel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.handle}
                  </option>
                ))}
              </StyledSelect>
            </StyledField>
          }
        />
        <StyledActions>
          <StyledRightActions style={{ marginLeft: 'auto' }}>
            <Button
              title={t`Cancel`}
              variant="tertiary"
              onClick={onClose}
              disabled={isSaving}
            />
            <Button
              title={t`Create`}
              variant="secondary"
              type="submit"
              disabled={isSaving}
            />
          </StyledRightActions>
        </StyledActions>
      </StyledDialog>
    </StyledBackdrop>
  );
};
