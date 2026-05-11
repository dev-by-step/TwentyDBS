import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
} from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type GroupCalendarViewMode } from '@/activities/group-calendar/types/GroupCalendarViewMode';

const StyledContainer = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
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

const VIEW_MODES: { label: string; mode: GroupCalendarViewMode }[] = [
  { label: 'Jour', mode: 'DAY' },
  { label: 'Semaine', mode: 'WEEK' },
  { label: 'Mois', mode: 'MONTH' },
];

const formatPeriodLabel = (
  viewMode: GroupCalendarViewMode,
  selectedDate: Date,
): string => {
  const locale = fr;

  switch (viewMode) {
    case 'DAY':
      return format(selectedDate, 'd MMMM yyyy', { locale });
    case 'WEEK': {
      const weekStart = format(selectedDate, 'd MMM', { locale });

      return `Semaine du ${weekStart}`;
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
};

export const GroupCalendarTopBar = ({
  viewMode,
  selectedDate,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
}: GroupCalendarTopBarProps) => (
  <StyledContainer>
    <StyledLeft>
      <IconCalendar size={themeCssVariables.icon.size.md} />
      <StyledPeriodLabel>
        {formatPeriodLabel(viewMode, selectedDate)}
      </StyledPeriodLabel>
    </StyledLeft>

    <StyledRight>
      <Button
        size="small"
        variant="tertiary"
        Icon={IconChevronLeft}
        onClick={onPrev}
      />
      <Button
        size="small"
        variant="tertiary"
        title={t`Aujourd'hui`}
        onClick={onToday}
      />
      <Button
        size="small"
        variant="tertiary"
        Icon={IconChevronRight}
        onClick={onNext}
      />

      <StyledViewModeSelector>
        {VIEW_MODES.map(({ label, mode }) => (
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
);
