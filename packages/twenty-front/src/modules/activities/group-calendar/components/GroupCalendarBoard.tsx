import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type Locale,
} from 'date-fns';
import { useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { CalendarEventNotSharedContent } from '@/activities/calendar/components/CalendarEventNotSharedContent';
import { CalendarEventParticipantsAvatarGroup } from '@/activities/calendar/components/CalendarEventParticipantsAvatarGroup';
import { getCalendarEventEndDate } from '@/activities/calendar/utils/getCalendarEventEndDate';
import { getCalendarEventStartDate } from '@/activities/calendar/utils/getCalendarEventStartDate';
import { sortCalendarEventsAsc } from '@/activities/calendar/utils/sortCalendarEvents';
import { type GroupCalendarViewMode } from '@/activities/group-calendar/types/GroupCalendarViewMode';
import { useOpenCalendarEventInSidePanel } from '@/side-panel/hooks/useOpenCalendarEventInSidePanel';
import {
  CalendarChannelVisibility,
  type TimelineCalendarEvent,
} from '~/generated/graphql';
import { groupArrayItemsBy } from '~/utils/array/groupArrayItemsBy';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type GroupCalendarBoardProps = {
  calendarEvents: TimelineCalendarEvent[];
  locale: Locale;
  selectedDate: Date;
  viewMode: GroupCalendarViewMode;
  renderEventActions: (calendarEvent: TimelineCalendarEvent) => React.ReactNode;
};

type CalendarBoardDay = {
  date: Date;
  isInSelectedMonth: boolean;
};

const StyledBoardViewport = styled.div`
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledBoard = styled.div<{ isSingleColumn: boolean }>`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.light};
  min-width: ${({ isSingleColumn }) => (isSingleColumn ? '360px' : '760px')};
  overflow: hidden;
`;

const StyledWeekdayHeader = styled.div<{ columnCount: number }>`
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  grid-template-columns: repeat(
    ${({ columnCount }) => columnCount},
    minmax(0, 1fr)
  );
`;

const StyledWeekdayCell = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  text-transform: uppercase;

  &:not(:last-child) {
    border-right: 1px solid ${themeCssVariables.border.color.light};
  }
`;

const StyledGrid = styled.div<{ columnCount: number; rowCount: number }>`
  display: grid;
  grid-auto-rows: minmax(${themeCssVariables.spacing[32]}, 1fr);
  grid-template-columns: repeat(
    ${({ columnCount }) => columnCount},
    minmax(0, 1fr)
  );
  min-height: ${({ rowCount }) =>
    rowCount <= 1 ? 'calc(100vh - 260px)' : 'auto'};
`;

const StyledDayCell = styled.div<{
  isCurrentDay: boolean;
  isMuted: boolean;
}>`
  background: ${({ isCurrentDay }) =>
    isCurrentDay
      ? themeCssVariables.background.transparent.lighter
      : themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  border-right: 1px solid ${themeCssVariables.border.color.light};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
  opacity: ${({ isMuted }) => (isMuted ? 0.48 : 1)};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledDayHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  min-width: 0;
`;

const StyledDayNumber = styled.div<{ isCurrentDay: boolean }>`
  align-items: center;
  background: ${({ isCurrentDay }) =>
    isCurrentDay ? themeCssVariables.color.blue : 'transparent'};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ isCurrentDay }) =>
    isCurrentDay
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.primary};
  display: flex;
  flex: 0 0 auto;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  height: ${themeCssVariables.spacing[6]};
  justify-content: center;
  width: ${themeCssVariables.spacing[6]};
`;

const StyledDayMonth = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEventCount = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex: 0 0 auto;
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledEvents = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledEventChip = styled.button<{
  entityColor?: string | null;
  showTitle: boolean;
}>`
  align-items: flex-start;
  background: ${({ entityColor }) =>
    entityColor
      ? `color-mix(in srgb, ${entityColor} 10%, ${themeCssVariables.background.primary})`
      : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ entityColor }) =>
      entityColor
        ? `color-mix(in srgb, ${entityColor} 36%, ${themeCssVariables.border.color.light})`
        : themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  cursor: ${({ showTitle }) => (showTitle ? 'pointer' : 'not-allowed')};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[1.5]} ${themeCssVariables.spacing[2]};
  text-align: left;
  width: 100%;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }
`;

const StyledEventTopLine = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  width: 100%;
`;

const StyledEventDot = styled.span<{ entityColor?: string | null }>`
  background: ${({ entityColor }) =>
    entityColor ?? themeCssVariables.tag.background.gray};
  border-radius: 50%;
  flex: 0 0 ${themeCssVariables.spacing[1.5]};
  height: ${themeCssVariables.spacing[1.5]};
  width: ${themeCssVariables.spacing[1.5]};
`;

const StyledEventTime = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  flex: 0 0 auto;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledEventTitle = styled.span<{ canceled: boolean }>`
  color: ${themeCssVariables.font.color.primary};
  flex: 1 1 auto;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  min-width: 0;
  overflow: hidden;
  text-decoration: ${({ canceled }) => (canceled ? 'line-through' : 'none')};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEventMetaLine = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: space-between;
  min-width: 0;
  width: 100%;
`;

const StyledEntityLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex: 1 1 auto;
  font-size: ${themeCssVariables.font.size.xs};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEventActions = styled.div`
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledMoreEvents = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const getBoardDays = ({
  selectedDate,
  viewMode,
}: {
  selectedDate: Date;
  viewMode: GroupCalendarViewMode;
}): CalendarBoardDay[] => {
  const interval =
    viewMode === 'MONTH'
      ? {
          start: startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 1 }),
          end: endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 }),
        }
      : viewMode === 'WEEK'
        ? {
            start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
            end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
          }
        : {
            start: startOfDay(selectedDate),
            end: startOfDay(selectedDate),
          };

  return eachDayOfInterval(interval).map((date) => ({
    date,
    isInSelectedMonth: viewMode !== 'MONTH' || isSameMonth(date, selectedDate),
  }));
};

const getEventTimeLabel = (calendarEvent: TimelineCalendarEvent) => {
  if (calendarEvent.isFullDay) {
    return t`All day`;
  }

  return `${format(getCalendarEventStartDate(calendarEvent), 'HH:mm')} - ${format(
    getCalendarEventEndDate(calendarEvent),
    'HH:mm',
  )}`;
};

const getResponsibleEntitiesLabel = (calendarEvent: TimelineCalendarEvent) => {
  const responsibleEntities = calendarEvent.responsibleEntities ?? [];

  if (responsibleEntities.length === 0) {
    return calendarEvent.entityName ?? null;
  }

  return responsibleEntities
    .map((entity) => entity.name)
    .filter(isDefined)
    .join(', ');
};

const MAX_VISIBLE_MONTH_EVENTS = 4;

export const GroupCalendarBoard = ({
  calendarEvents,
  locale,
  selectedDate,
  viewMode,
  renderEventActions,
}: GroupCalendarBoardProps) => {
  const { openCalendarEventInSidePanel } = useOpenCalendarEventInSidePanel();

  const boardDays = useMemo(
    () => getBoardDays({ selectedDate, viewMode }),
    [selectedDate, viewMode],
  );

  const calendarEventsByDayTime = useMemo(
    () =>
      groupArrayItemsBy(
        [...calendarEvents].sort(sortCalendarEventsAsc),
        (event) => startOfDay(getCalendarEventStartDate(event)).getTime(),
      ),
    [calendarEvents],
  );

  const columnCount = viewMode === 'DAY' ? 1 : 7;
  const rowCount = Math.ceil(boardDays.length / columnCount);
  const weekdayDays = boardDays.slice(0, columnCount);

  return (
    <StyledBoardViewport>
      <StyledBoard isSingleColumn={columnCount === 1}>
        <StyledWeekdayHeader columnCount={columnCount}>
          {weekdayDays.map(({ date }) => (
            <StyledWeekdayCell key={date.getTime()}>
              {format(date, viewMode === 'DAY' ? 'EEEE d MMMM' : 'EEE', {
                locale,
              })}
            </StyledWeekdayCell>
          ))}
        </StyledWeekdayHeader>
        <StyledGrid columnCount={columnCount} rowCount={rowCount}>
          {boardDays.map(({ date, isInSelectedMonth }) => {
            const dayEvents =
              calendarEventsByDayTime[startOfDay(date).getTime()] ?? [];
            const visibleEvents =
              viewMode === 'MONTH'
                ? dayEvents.slice(0, MAX_VISIBLE_MONTH_EVENTS)
                : dayEvents;
            const hiddenEventsCount = dayEvents.length - visibleEvents.length;

            return (
              <StyledDayCell
                key={date.getTime()}
                isCurrentDay={isToday(date)}
                isMuted={!isInSelectedMonth}
              >
                <StyledDayHeader>
                  <StyledDayNumber isCurrentDay={isToday(date)}>
                    {format(date, 'd', { locale })}
                  </StyledDayNumber>
                  <StyledDayMonth>
                    {format(date, 'MMM', { locale })}
                  </StyledDayMonth>
                  {dayEvents.length > 0 && (
                    <StyledEventCount>
                      {dayEvents.length === 1
                        ? t`1 event`
                        : t`${dayEvents.length} events`}
                    </StyledEventCount>
                  )}
                </StyledDayHeader>
                <StyledEvents>
                  {visibleEvents.map((calendarEvent) => {
                    const showTitle =
                      calendarEvent.visibility ===
                      CalendarChannelVisibility.SHARE_EVERYTHING;
                    const responsibleEntitiesLabel =
                      getResponsibleEntitiesLabel(calendarEvent);
                    const eventActions = renderEventActions(calendarEvent);

                    return (
                      <StyledEventChip
                        key={calendarEvent.id}
                        entityColor={calendarEvent.entityColor}
                        showTitle={showTitle}
                        title={showTitle ? calendarEvent.title : t`Not shared`}
                        type="button"
                        onClick={
                          showTitle
                            ? () =>
                                openCalendarEventInSidePanel(calendarEvent.id)
                            : undefined
                        }
                      >
                        {showTitle ? (
                          <>
                            <StyledEventTopLine>
                              <StyledEventDot
                                entityColor={calendarEvent.entityColor}
                              />
                              <StyledEventTime>
                                {getEventTimeLabel(calendarEvent)}
                              </StyledEventTime>
                              <StyledEventTitle
                                canceled={calendarEvent.isCanceled}
                              >
                                {calendarEvent.title}
                              </StyledEventTitle>
                            </StyledEventTopLine>
                            <StyledEventMetaLine>
                              <StyledEntityLabel>
                                {responsibleEntitiesLabel}
                              </StyledEntityLabel>
                              {!!calendarEvent.participants?.length && (
                                <CalendarEventParticipantsAvatarGroup
                                  participants={calendarEvent.participants}
                                />
                              )}
                              {isDefined(eventActions) && (
                                <StyledEventActions
                                  onClick={(event) => event.stopPropagation()}
                                  onMouseDown={(event) =>
                                    event.stopPropagation()
                                  }
                                >
                                  {eventActions}
                                </StyledEventActions>
                              )}
                            </StyledEventMetaLine>
                          </>
                        ) : (
                          <CalendarEventNotSharedContent />
                        )}
                      </StyledEventChip>
                    );
                  })}
                  {hiddenEventsCount > 0 && (
                    <StyledMoreEvents>
                      {t`+${hiddenEventsCount} more`}
                    </StyledMoreEvents>
                  )}
                </StyledEvents>
              </StyledDayCell>
            );
          })}
        </StyledGrid>
      </StyledBoard>
    </StyledBoardViewport>
  );
};
