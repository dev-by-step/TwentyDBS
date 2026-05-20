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

type CalendarEventResponsibleEntity = {
  id: string;
  name?: string | null;
  color?: string | null;
};

const MAX_VISIBLE_ENTITY_BADGES = 2;

const StyledContainer = styled.div<{ showTitle?: boolean }>`
  align-items: center;
  cursor: ${({ showTitle }) => (showTitle ? 'pointer' : 'not-allowed')};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  min-height: ${themeCssVariables.spacing[6]};
  position: relative;
`;

const StyledAttendanceIndicator = styled.div<{
  active?: boolean;
  entityColor?: string | null;
}>`
  align-self: stretch;
  background-color: ${({ active, entityColor }) =>
    entityColor ??
    (active
      ? themeCssVariables.tag.background.red
      : themeCssVariables.tag.background.gray)};
  border-radius: ${themeCssVariables.border.radius.xs};
  height: 100%;
  min-height: ${themeCssVariables.spacing[6]};
  width: ${themeCssVariables.spacing[1]};
`;

const StyledLabels = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex: 1 1 auto;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledEntityBadges = styled.div`
  align-items: center;
  display: flex;
  flex: 0 1 auto;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
  max-width: 42%;
  min-width: 0;
`;

const StyledEntityBadge = styled.div<{ entityColor?: string | null }>`
  align-items: center;
  background: ${({ entityColor }) =>
    entityColor
      ? `color-mix(in srgb, ${entityColor} 12%, transparent)`
      : themeCssVariables.background.transparent.light};
  border: 1px solid
    ${({ entityColor }) =>
      entityColor
        ? `color-mix(in srgb, ${entityColor} 34%, ${themeCssVariables.border.color.light})`
        : themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
  height: ${themeCssVariables.spacing[5]};
  line-height: ${themeCssVariables.spacing[5]};
  max-width: ${themeCssVariables.spacing[28]};
  min-width: 0;
  padding: 0 ${themeCssVariables.spacing[2]} 0 ${themeCssVariables.spacing[1]};
  white-space: nowrap;
`;

const StyledEntityBadgeDot = styled.span<{ entityColor?: string | null }>`
  background: ${({ entityColor }) =>
    entityColor ?? themeCssVariables.tag.background.gray};
  border-radius: 50%;
  flex: 0 0 ${themeCssVariables.spacing[1.5]};
  height: ${themeCssVariables.spacing[1.5]};
  width: ${themeCssVariables.spacing[1.5]};
`;

const StyledEntityBadgeLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEntityOverflowBadge = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.transparent.light};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 0 0 auto;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  height: ${themeCssVariables.spacing[5]};
  line-height: ${themeCssVariables.spacing[5]};
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledTime = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex: 0 0 ${themeCssVariables.spacing[26]};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTitle = styled.div<{ active: boolean; canceled: boolean }>`
  color: ${({ active }) =>
    active ? themeCssVariables.font.color.primary : 'inherit'};
  flex: 1 1 auto;
  font-weight: ${({ active }) =>
    active ? themeCssVariables.font.weight.medium : 'inherit'};
  min-width: 0;
  overflow: hidden;
  text-decoration: ${({ canceled }) => (canceled ? 'line-through' : 'none')};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledActionsContainer = styled.div`
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: ${themeCssVariables.spacing[1]};
`;

const getResponsibleEntities = (
  calendarEvent: TimelineCalendarEvent,
): CalendarEventResponsibleEntity[] => {
  const responsibleEntities = (
    calendarEvent as TimelineCalendarEvent & {
      responsibleEntities?: CalendarEventResponsibleEntity[] | null;
    }
  ).responsibleEntities;

  if (isDefined(responsibleEntities) && responsibleEntities.length > 0) {
    return responsibleEntities;
  }

  const entityName = (calendarEvent as { entityName?: string | null })
    .entityName;

  if (!isDefined(entityName)) {
    return [];
  }

  return [
    {
      id: calendarEvent.ownerEntityId ?? entityName,
      name: entityName,
      color: calendarEvent.entityColor,
    },
  ];
};

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
  const responsibleEntities = getResponsibleEntities(calendarEvent);
  const visibleResponsibleEntities = responsibleEntities.slice(
    0,
    MAX_VISIBLE_ENTITY_BADGES,
  );
  const hiddenResponsibleEntities = responsibleEntities.slice(
    MAX_VISIBLE_ENTITY_BADGES,
  );
  const entityNamesTooltip = responsibleEntities
    .map((entity) => entity.name ?? t`Unnamed entity`)
    .join(', ');

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
        {responsibleEntities.length > 0 && (
          <StyledEntityBadges title={entityNamesTooltip}>
            {visibleResponsibleEntities.map((entity) => (
              <StyledEntityBadge key={entity.id} entityColor={entity.color}>
                <StyledEntityBadgeDot entityColor={entity.color} />
                <StyledEntityBadgeLabel>
                  {entity.name ?? t`Unnamed entity`}
                </StyledEntityBadgeLabel>
              </StyledEntityBadge>
            ))}
            {hiddenResponsibleEntities.length > 0 && (
              <StyledEntityOverflowBadge>
                +{hiddenResponsibleEntities.length}
              </StyledEntityOverflowBadge>
            )}
          </StyledEntityBadges>
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
