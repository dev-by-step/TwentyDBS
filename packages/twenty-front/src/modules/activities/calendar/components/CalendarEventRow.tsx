import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { format } from 'date-fns';
import { isDefined } from 'twenty-shared/utils';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import {
  CalendarChannelVisibility,
  type TimelineCalendarEvent,
} from '~/generated/graphql';

import { CalendarEventNotSharedContent } from '@/activities/calendar/components/CalendarEventNotSharedContent';
import { CalendarEventParticipantsAvatarGroup } from '@/activities/calendar/components/CalendarEventParticipantsAvatarGroup';
import { getCalendarEventEndDate } from '@/activities/calendar/utils/getCalendarEventEndDate';
import { getCalendarEventStartDate } from '@/activities/calendar/utils/getCalendarEventStartDate';
import { hasCalendarEventEnded } from '@/activities/calendar/utils/hasCalendarEventEnded';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useOpenCalendarEventInSidePanel } from '@/side-panel/hooks/useOpenCalendarEventInSidePanel';
import { useContext } from 'react';
import { IconArrowRight } from 'twenty-ui/display';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

type CalendarEventRowProps = {
  calendarEvent: TimelineCalendarEvent;
  className?: string;
  actions?: React.ReactNode;
};

const StyledContainer = styled.div<{ showTitle?: boolean }>`
  align-items: center;
  cursor: ${({ showTitle }) => (showTitle ? 'pointer' : 'not-allowed')};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  height: ${themeCssVariables.spacing[6]};
  position: relative;
`;

const StyledAttendanceIndicator = styled.div<{
  active?: boolean;
  entityColor?: string | null;
}>`
  background-color: ${({ active, entityColor }) =>
    entityColor ??
    (active
      ? themeCssVariables.tag.background.red
      : themeCssVariables.tag.background.gray)};
  border-radius: ${themeCssVariables.border.radius.xs};
  height: 100%;
  width: ${themeCssVariables.spacing[1]};
`;

const StyledLabels = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex: 1 0 auto;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledEntityBadge = styled.div<{ entityColor?: string | null }>`
  align-items: center;
  background: ${({ entityColor }) =>
    entityColor ?? themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.inverted};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  line-height: 1;
  max-width: ${themeCssVariables.spacing[28]};
  padding: 0 ${themeCssVariables.spacing[2]};
  white-space: nowrap;
`;

const StyledTime = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  width: ${themeCssVariables.spacing[26]};
`;

const StyledTitle = styled.div<{ active: boolean; canceled: boolean }>`
  color: ${({ active }) =>
    active ? themeCssVariables.font.color.primary : 'inherit'};
  flex: 1 0 auto;
  font-weight: ${({ active }) =>
    active ? themeCssVariables.font.weight.medium : 'inherit'};
  overflow: hidden;
  text-decoration: ${({ canceled }) => (canceled ? 'line-through' : 'none')};
  text-overflow: ellipsis;
  white-space: nowrap;
  width: ${themeCssVariables.spacing[10]};
`;

const StyledActionsContainer = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

export const CalendarEventRow = ({
  calendarEvent,
  className,
  actions,
}: CalendarEventRowProps) => {
  const { theme } = useContext(ThemeContext);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const { openCalendarEventInSidePanel } = useOpenCalendarEventInSidePanel();

  const startsAt = getCalendarEventStartDate(calendarEvent);
  const endsAt = getCalendarEventEndDate(calendarEvent);
  const hasEnded = hasCalendarEventEnded(calendarEvent);

  const startTimeLabel = calendarEvent.isFullDay
    ? t`All day`
    : format(startsAt, 'HH:mm');
  const endTimeLabel = calendarEvent.isFullDay ? '' : format(endsAt, 'HH:mm');

  const isCurrentWorkspaceMemberAttending = calendarEvent.participants?.some(
    ({ workspaceMemberId }) => workspaceMemberId === currentWorkspaceMember?.id,
  );
  const showTitle =
    calendarEvent.visibility === CalendarChannelVisibility.SHARE_EVERYTHING;
  const entityName = (calendarEvent as { entityName?: string | null })
    .entityName;

  return (
    <StyledContainer
      className={className}
      showTitle={showTitle}
      onClick={
        showTitle
          ? () => {
              openCalendarEventInSidePanel(calendarEvent.id);
            }
          : undefined
      }
    >
      <StyledAttendanceIndicator
        active={isCurrentWorkspaceMemberAttending}
        entityColor={calendarEvent.entityColor}
      />
      <StyledLabels>
        <StyledTime>
          {startTimeLabel}
          {endTimeLabel && (
            <>
              <IconArrowRight size={theme.icon.size.sm} />
              {endTimeLabel}
            </>
          )}
        </StyledTime>
        {showTitle ? (
          <StyledTitle active={!hasEnded} canceled={!!calendarEvent.isCanceled}>
            {calendarEvent.title}
          </StyledTitle>
        ) : (
          <CalendarEventNotSharedContent />
        )}
        {!!entityName && (
          <StyledEntityBadge entityColor={calendarEvent.entityColor}>
            {entityName}
          </StyledEntityBadge>
        )}
      </StyledLabels>
      {!!calendarEvent.participants?.length && (
        <CalendarEventParticipantsAvatarGroup
          participants={calendarEvent.participants}
        />
      )}
      {isDefined(actions) && (
        <StyledActionsContainer
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {actions}
        </StyledActionsContainer>
      )}
    </StyledContainer>
  );
};
