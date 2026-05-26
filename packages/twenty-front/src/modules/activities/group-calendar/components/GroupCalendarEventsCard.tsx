import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { format, getYear } from 'date-fns';
import { useState } from 'react';

import { CalendarDayCardContent } from '@/activities/calendar/components/CalendarDayCardContent';
import { GroupCalendarBoard } from '@/activities/group-calendar/components/GroupCalendarBoard';
import { GroupCalendarEditEventModal } from '@/activities/group-calendar/components/GroupCalendarEditEventModal';
import { GroupCalendarTopBar } from '@/activities/group-calendar/components/GroupCalendarTopBar';
import { useCurrentUserEntityIds } from '@/activities/group-calendar/hooks/useCurrentUserEntityIds';
import { useGroupCalendarEvents } from '@/activities/group-calendar/hooks/useGroupCalendarEvents';
import { groupCalendarDisplayModeState } from '@/activities/group-calendar/states/groupCalendarDisplayModeState';
import { CalendarContext } from '@/activities/calendar/contexts/CalendarContext';
import { useCalendarEvents } from '@/activities/calendar/hooks/useCalendarEvents';
import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { currentUserState } from '@/auth/states/currentUserState';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { dateLocaleState } from '~/localization/states/dateLocaleState';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import {
  CalendarChannelVisibility,
  type TimelineCalendarEvent,
} from '~/generated/graphql';
import { H3Title, IconPencil } from 'twenty-ui/display';
import { IconButton } from 'twenty-ui/input';
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
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[8]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]};
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
    refetch,
    navigatePrev,
    navigateNext,
    navigateToday,
  } = useGroupCalendarEvents();
  const { localeCatalog } = useAtomStateValue(dateLocaleState);
  const { objectMetadataItem: calendarEventMetadata } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.CalendarEvent,
  });
  const calendarEventPermissions = useObjectPermissionsForObject(
    calendarEventMetadata.id,
  );
  const hasGlobalCalendarEventUpdatePermission =
    calendarEventPermissions.canUpdateObjectRecords ||
    calendarEventPermissions.canSoftDeleteObjectRecords;
  const currentUser = useAtomStateValue(currentUserState);
  const currentUserEntityIds = useCurrentUserEntityIds();
  const isPlatformAdmin = currentUser?.canAccessFullAdminPanel === true;
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [groupCalendarDisplayMode, setGroupCalendarDisplayMode] = useAtomState(
    groupCalendarDisplayModeState,
  );

  const renderEventActions = (calendarEvent: TimelineCalendarEvent) => {
    if (!hasGlobalCalendarEventUpdatePermission) {
      return null;
    }

    if (
      calendarEvent.visibility !== CalendarChannelVisibility.SHARE_EVERYTHING
    ) {
      return null;
    }

    const ownerEntityId = calendarEvent.ownerEntityId;

    const canManageThisEvent =
      isPlatformAdmin ||
      (isDefined(ownerEntityId) && currentUserEntityIds.has(ownerEntityId));

    if (!canManageThisEvent) {
      return null;
    }

    return (
      <IconButton
        Icon={IconPencil}
        size="small"
        variant="tertiary"
        ariaLabel={t`Edit event`}
        onClick={() => setEditingEventId(calendarEvent.id)}
      />
    );
  };

  const {
    calendarEventsByDayTime,
    daysByMonthTime,
    monthTimes,
    monthTimesByYear,
  } = useCalendarEvents(calendarEvents);

  return (
    <StyledWrapper>
      <GroupCalendarTopBar
        viewMode={viewMode}
        selectedDate={selectedDate}
        displayMode={groupCalendarDisplayMode}
        onDisplayModeChange={setGroupCalendarDisplayMode}
        onViewModeChange={setViewMode}
        onPrev={navigatePrev}
        onNext={navigateNext}
        onToday={navigateToday}
        onEventCreated={refetch}
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
              {t`No Events`}
            </AnimatedPlaceholderEmptyTitle>
            <AnimatedPlaceholderEmptySubTitle>
              {t`No event is scheduled for this period.`}
            </AnimatedPlaceholderEmptySubTitle>
          </AnimatedPlaceholderEmptyTextContainer>
        </AnimatedPlaceholderEmptyContainer>
      ) : (
        <>
          {groupCalendarDisplayMode === 'CALENDAR' ? (
            <GroupCalendarBoard
              calendarEvents={calendarEvents}
              locale={localeCatalog}
              selectedDate={selectedDate}
              viewMode={viewMode}
              renderEventActions={renderEventActions}
            />
          ) : (
            <CalendarContext.Provider value={{ calendarEventsByDayTime }}>
              <StyledScrollArea>
                {monthTimes.map((monthTime) => {
                  const monthDayTimes = daysByMonthTime[monthTime] ?? [];
                  const year = getYear(monthTime);
                  const lastMonthOfYear = monthTimesByYear[year]?.[0];
                  const isLastMonthOfYear = lastMonthOfYear === monthTime;
                  const monthLabel = format(monthTime, 'MMMM', {
                    locale: localeCatalog,
                  });

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
                            calendarEvents={
                              calendarEventsByDayTime[dayTime] ?? []
                            }
                            divider={index < monthDayTimes.length - 1}
                            renderEventActions={renderEventActions}
                          />
                        ))}
                      </Card>
                    </Section>
                  );
                })}
              </StyledScrollArea>
            </CalendarContext.Provider>
          )}
        </>
      )}
      {editingEventId && (
        <GroupCalendarEditEventModal
          eventId={editingEventId}
          onClose={() => setEditingEventId(null)}
          onSaved={refetch}
          onDeleted={refetch}
        />
      )}
    </StyledWrapper>
  );
};
