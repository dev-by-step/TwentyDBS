import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { format, getYear } from 'date-fns';
import { fr } from 'date-fns/locale';

import { CalendarDayCardContent } from '@/activities/calendar/components/CalendarDayCardContent';
import { GroupCalendarTopBar } from '@/activities/group-calendar/components/GroupCalendarTopBar';
import { useGroupCalendarEvents } from '@/activities/group-calendar/hooks/useGroupCalendarEvents';
import { CalendarContext } from '@/activities/calendar/contexts/CalendarContext';
import { useCalendarEvents } from '@/activities/calendar/hooks/useCalendarEvents';
import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { H3Title } from 'twenty-ui/display';
import {
  AnimatedPlaceholder,
  AnimatedPlaceholderEmptyContainer,
  AnimatedPlaceholderEmptySubTitle,
  AnimatedPlaceholderEmptyTextContainer,
  AnimatedPlaceholderEmptyTitle,
  EMPTY_PLACEHOLDER_TRANSITION_PROPS,
  Card,
  Section,
} from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const StyledScrollArea = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[8]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]};
  flex: 1;
`;

const StyledYear = styled.span`
  color: ${themeCssVariables.font.color.light};
`;

const StyledTitleContainer = styled.div`
  margin-bottom: ${themeCssVariables.spacing[4]};
`;

export const GroupCalendarEventsCard = () => {
  const {
    viewMode,
    setViewMode,
    selectedDate,
    loading,
    calendarEvents,
    navigatePrev,
    navigateNext,
    navigateToday,
  } = useGroupCalendarEvents();

  const { calendarEventsByDayTime, daysByMonthTime, monthTimes, monthTimesByYear } =
    useCalendarEvents(calendarEvents);

  return (
    <StyledWrapper>
      <GroupCalendarTopBar
        viewMode={viewMode}
        selectedDate={selectedDate}
        onViewModeChange={setViewMode}
        onPrev={navigatePrev}
        onNext={navigateNext}
        onToday={navigateToday}
      />

      {loading ? (
        <SkeletonLoader />
      ) : calendarEvents.length === 0 ? (
        <AnimatedPlaceholderEmptyContainer
          // oxlint-disable-next-line react/jsx-props-no-spreading
          {...EMPTY_PLACEHOLDER_TRANSITION_PROPS}
        >
          <AnimatedPlaceholder type="noMatchRecord" />
          <AnimatedPlaceholderEmptyTextContainer>
            <AnimatedPlaceholderEmptyTitle>
              {t`Aucun événement`}
            </AnimatedPlaceholderEmptyTitle>
            <AnimatedPlaceholderEmptySubTitle>
              {t`Aucun créneau n'est planifié pour cette période.`}
            </AnimatedPlaceholderEmptySubTitle>
          </AnimatedPlaceholderEmptyTextContainer>
        </AnimatedPlaceholderEmptyContainer>
      ) : (
        <CalendarContext.Provider value={{ calendarEventsByDayTime }}>
          <StyledScrollArea>
            {monthTimes.map((monthTime) => {
              const monthDayTimes = daysByMonthTime[monthTime] ?? [];
              const year = getYear(monthTime);
              const lastMonthOfYear = monthTimesByYear[year]?.[0];
              const isLastMonthOfYear = lastMonthOfYear === monthTime;
              const monthLabel = format(monthTime, 'MMMM', { locale: fr });

              return (
                <Section key={monthTime}>
                  <StyledTitleContainer>
                    <H3Title
                      title={
                        <>
                          {monthLabel}
                          {isLastMonthOfYear && (
                            <StyledYear> {year}</StyledYear>
                          )}
                        </>
                      }
                    />
                  </StyledTitleContainer>
                  <Card fullWidth>
                    {monthDayTimes.map((dayTime, index) => (
                      <CalendarDayCardContent
                        key={dayTime}
                        calendarEvents={calendarEventsByDayTime[dayTime] ?? []}
                        divider={index < monthDayTimes.length - 1}
                      />
                    ))}
                  </Card>
                </Section>
              );
            })}
          </StyledScrollArea>
        </CalendarContext.Provider>
      )}
    </StyledWrapper>
  );
};
