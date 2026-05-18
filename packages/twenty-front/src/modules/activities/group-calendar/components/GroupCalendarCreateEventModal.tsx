import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { format, addHours, startOfHour } from 'date-fns';
import { type FormEvent, useState } from 'react';
import { v4 } from 'uuid';

import { type CalendarChannel } from '@/accounts/types/CalendarChannel';
import { useMyCalendarChannels } from '@/settings/accounts/hooks/useMyCalendarChannels';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const CALENDAR_CHANNEL_EVENT_ASSOCIATION_OBJECT_NAME =
  'calendarChannelEventAssociation';

const StyledBackdrop = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.transparent.medium};
  bottom: 0;
  display: flex;
  justify-content: center;
  left: 0;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 9999;
`;

const StyledDialog = styled.form`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  max-width: 420px;
  padding: ${themeCssVariables.spacing[5]};
  width: calc(100% - ${themeCssVariables.spacing[8]});
`;

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  height: ${themeCssVariables.spacing[8]};
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  height: ${themeCssVariables.spacing[8]};
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const formatDateTimeInputValue = (date: Date) =>
  format(date, "yyyy-MM-dd'T'HH:mm");

type GroupCalendarCreateEventModalProps = {
  selectedDate: Date;
  onClose: () => void;
  onCreated: () => Promise<unknown> | unknown;
};

export const GroupCalendarCreateEventModal = ({
  selectedDate,
  onClose,
  onCreated,
}: GroupCalendarCreateEventModalProps) => {
  const defaultStart = startOfHour(addHours(selectedDate, 1));
  const defaultEnd = addHours(defaultStart, 1);
  const { channels, loading: calendarChannelsLoading } =
    useMyCalendarChannels();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(
    formatDateTimeInputValue(defaultStart),
  );
  const [endsAt, setEndsAt] = useState(formatDateTimeInputValue(defaultEnd));
  const [calendarChannelId, setCalendarChannelId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

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

    setIsSaving(true);

    try {
      const createdEvent = await createCalendarEvent({
        title,
        isCanceled: false,
        isFullDay: false,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        externalCreatedAt: new Date().toISOString(),
        externalUpdatedAt: new Date().toISOString(),
      });

      await createCalendarChannelEventAssociation({
        calendarEventId: createdEvent.id,
        calendarChannelId: selectedCalendarChannelId,
        eventExternalId: `manual-${v4()}`,
        recurringEventExternalId: null,
      });

      enqueueSuccessSnackBar({ message: t`Event created.` });
      await onCreated();
      onClose();
    } catch (error) {
      enqueueErrorSnackBar({
        message: error instanceof Error ? error.message : t`An error occurred.`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledBackdrop>
      <StyledDialog onSubmit={handleSubmit}>
        <StyledTitle>{t`New event`}</StyledTitle>
        <StyledField>
          {t`Title`}
          <StyledInput
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </StyledField>
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
        <StyledField>
          {t`Starts at`}
          <StyledInput
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            required
          />
        </StyledField>
        <StyledField>
          {t`Ends at`}
          <StyledInput
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            required
          />
        </StyledField>
        <StyledActions>
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
        </StyledActions>
      </StyledDialog>
    </StyledBackdrop>
  );
};
