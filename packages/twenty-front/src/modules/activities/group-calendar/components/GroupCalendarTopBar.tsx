import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type Locale, format } from 'date-fns';
import {
  IconCalendar,
  IconCalendarMonth,
  IconChevronLeft,
  IconChevronRight,
  IconLayoutList,
  IconPlus,
} from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { GroupCalendarCreateEventModal } from '@/activities/group-calendar/components/GroupCalendarCreateEventModal';
import { GroupCalendarEntityFilterSelector } from '@/activities/group-calendar/components/GroupCalendarEntityFilterSelector';
import { GROUP_CALENDAR_CONFIG } from '@/activities/group-calendar/constants/GroupCalendar';
import { type GroupCalendarDisplayMode } from '@/activities/group-calendar/types/GroupCalendarDisplayMode';
import { type GroupCalendarViewMode } from '@/activities/group-calendar/types/GroupCalendarViewMode';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { dateLocaleState } from '~/localization/states/dateLocaleState';

const StyledContainer = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledLeft = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledPeriodLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  min-width: 180px;
  text-align: center;
`;

const StyledRight = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
`;

const StyledViewModeSelector = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  display: flex;
  gap: ${themeCssVariables.spacing[0.5]};
  padding: ${themeCssVariables.spacing[0.5]};
`;

const StyledViewModeButton = styled.button<{ isActive: boolean }>`
  align-items: center;
  background: ${({ isActive }) =>
    isActive ? themeCssVariables.background.transparent.light : 'transparent'};
  border: 0;
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
  height: ${themeCssVariables.spacing[6]};
  justify-content: center;
  min-width: ${themeCssVariables.spacing[8]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledIconViewModeButton = styled(StyledViewModeButton)`
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const formatPeriodLabel = ({
  viewMode,
  selectedDate,
  locale,
  weekOfPrefix,
}: {
  viewMode: GroupCalendarViewMode;
  selectedDate: Date;
  locale: Locale;
  weekOfPrefix: string;
}): string => {
  switch (viewMode) {
    case 'DAY':
      return format(selectedDate, 'd MMMM yyyy', { locale });
    case 'WEEK': {
      const weekStart = format(selectedDate, 'd MMM', { locale });

      return `${weekOfPrefix} ${weekStart}`;
    }
    case 'MONTH':
      return format(selectedDate, 'MMMM yyyy', { locale });
  }
};

type GroupCalendarTopBarProps = {
  displayMode: GroupCalendarDisplayMode;
  viewMode: GroupCalendarViewMode;
  selectedDate: Date;
  onDisplayModeChange: (mode: GroupCalendarDisplayMode) => void;
  onViewModeChange: (mode: GroupCalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onEventCreated: () => Promise<unknown> | unknown;
};

export const GroupCalendarTopBar = ({
  displayMode,
  viewMode,
  selectedDate,
  onDisplayModeChange,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  onEventCreated,
}: GroupCalendarTopBarProps) => {
  const { t } = useLingui();
  const { localeCatalog } = useAtomStateValue(dateLocaleState);
  const { openModal } = useModal();

  const viewModes: { label: string; mode: GroupCalendarViewMode }[] = [
    { label: t`Day`, mode: 'DAY' },
    { label: t`Week`, mode: 'WEEK' },
    { label: t`Month`, mode: 'MONTH' },
  ];
  const displayModes: {
    Icon: typeof IconLayoutList;
    label: string;
    mode: GroupCalendarDisplayMode;
  }[] = [
    { Icon: IconLayoutList, label: t`List view`, mode: 'LIST' },
    { Icon: IconCalendarMonth, label: t`Calendar view`, mode: 'CALENDAR' },
  ];

  return (
    <>
      <StyledContainer>
        <StyledLeft>
          <IconCalendar size={themeCssVariables.icon.size.md} />
          <StyledPeriodLabel>
            {formatPeriodLabel({
              viewMode,
              selectedDate,
              locale: localeCatalog,
              weekOfPrefix: t`Week of`,
            })}
          </StyledPeriodLabel>
        </StyledLeft>

        <StyledRight>
          <Button
            size="small"
            variant="secondary"
            Icon={IconPlus}
            title={t`New event`}
            onClick={() =>
              openModal(GROUP_CALENDAR_CONFIG.modalIds.createEvent)
            }
          />
          <Button
            size="small"
            variant="tertiary"
            Icon={IconChevronLeft}
            onClick={onPrev}
          />
          <Button
            size="small"
            variant="tertiary"
            title={t`Today`}
            onClick={onToday}
          />
          <Button
            size="small"
            variant="tertiary"
            Icon={IconChevronRight}
            onClick={onNext}
          />

          <StyledViewModeSelector>
            {displayModes.map(({ Icon, label, mode }) => (
              <StyledIconViewModeButton
                key={mode}
                aria-label={label}
                title={label}
                isActive={displayMode === mode}
                onClick={() => onDisplayModeChange(mode)}
                type="button"
              >
                <Icon size={themeCssVariables.icon.size.sm} />
              </StyledIconViewModeButton>
            ))}
          </StyledViewModeSelector>

          <StyledViewModeSelector>
            {viewModes.map(({ label, mode }) => (
              <StyledViewModeButton
                key={mode}
                isActive={viewMode === mode}
                onClick={() => onViewModeChange(mode)}
                type="button"
              >
                {label}
              </StyledViewModeButton>
            ))}
          </StyledViewModeSelector>

          <GroupCalendarEntityFilterSelector />
        </StyledRight>
      </StyledContainer>
      <GroupCalendarCreateEventModal
        selectedDate={selectedDate}
        onCreated={onEventCreated}
      />
    </>
  );
};
