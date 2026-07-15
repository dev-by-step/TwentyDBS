import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledGroupCalendarSelectableChip = styled.button<{
  selected: boolean;
  chipColor?: string | null;
}>`
  align-items: center;
  background: ${({ selected, chipColor }) =>
    selected
      ? (chipColor ?? themeCssVariables.background.tertiary)
      : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ selected, chipColor }) =>
      selected
        ? (chipColor ?? themeCssVariables.border.color.strong)
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ selected }) =>
    selected
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;
