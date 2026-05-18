import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type Locale, format } from 'date-fns';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { GroupCalendarCreateEventModal } from '@/activities/group-calendar/components/GroupCalendarCreateEventModal';
import { type GroupCalendarViewMode } from '@/activities/group-calendar/types/GroupCalendarViewMode';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { dateLocaleState } from '~/localization/states/dateLocaleState';
import { useState } from 'react';

const StyledContainer = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
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
  gap: ${themeCssVariables.spacing[1]};
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
  background: ${({ isActive }) =>
    isActive ? themeCssVariables.background.transparent.light : 'transparent'};
  border: 0;
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
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
  viewMode: GroupCalendarViewMode;
  selectedDate: Date;
  onViewModeChange: (mode: GroupCalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onEventCreated: () => Promise<unknown> | unknown;
};

export const GroupCalendarTopBar = ({
  viewMode,
  selectedDate,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  onEventCreated,
}: GroupCalendarTopBarProps) => {
  const { t } = useLingui();
  const { localeCatalog } = useAtomStateValue(dateLocaleState);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const viewModes: { label: string; mode: GroupCalendarViewMode }[] = [
    { label: t`Day`, mode: 'DAY' },
    { label: t`Week`, mode: 'WEEK' },
    { label: t`Month`, mode: 'MONTH' },
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
            onClick={() => setIsCreateModalOpen(true)}
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
        </StyledRight>
      </StyledContainer>
      {isCreateModalOpen && (
        <GroupCalendarCreateEventModal
          selectedDate={selectedDate}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={onEventCreated}
        />
      )}
    </>
  );
};
