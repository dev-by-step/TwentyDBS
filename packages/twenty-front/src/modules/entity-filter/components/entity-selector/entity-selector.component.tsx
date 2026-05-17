import {
  ENTITY_FILTER_VIEW_MODE,
  type EntityFilterViewMode,
} from '@/entity-filter/constants/entityFilterViewMode';
import { useEntityFilter } from '@/entity-filter/hooks/useEntityFilter';
import { type EntitySelectorButtonProps } from '@/entity-filter/types/EntityFilterTypes';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconBuildingSkyscraper, IconSitemap } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useIsMobile } from 'twenty-ui/utilities';

const StyledSelector = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  box-sizing: border-box;
  display: flex;
  gap: ${themeCssVariables.spacing[0.5]};
  min-height: ${themeCssVariables.spacing[8]};
  padding: ${themeCssVariables.spacing[0.5]};
  width: 100%;
`;

const StyledSelectorButton = styled.button<{ isActive: boolean }>`
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
  flex: 1 1 0;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
  height: ${themeCssVariables.spacing[7]};
  justify-content: center;
  min-width: 0;
  padding: 0 ${themeCssVariables.spacing[2]};
  white-space: nowrap;

  &:disabled {
    color: ${themeCssVariables.font.color.tertiary};
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    background: ${({ isActive }) =>
      isActive
        ? themeCssVariables.background.transparent.light
        : themeCssVariables.background.transparent.lighter};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledButtonLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StyledIconContainer = styled.span`
  align-items: center;
  display: flex;
  flex-shrink: 0;
`;

const EntitySelectorButton = ({
  Icon,
  disabled,
  isActive,
  label,
  onClick,
}: EntitySelectorButtonProps) => (
  <StyledSelectorButton
    aria-pressed={isActive}
    disabled={disabled}
    isActive={isActive}
    onClick={onClick}
    type="button"
  >
    <StyledIconContainer>
      <Icon size={themeCssVariables.icon.size.sm} />
    </StyledIconContainer>
    <StyledButtonLabel>{label}</StyledButtonLabel>
  </StyledSelectorButton>
);

type ViewModeOption = {
  icon: EntitySelectorButtonProps['Icon'];
  label: string;
  mode: EntityFilterViewMode;
  onClick: () => void;
};

export const EntitySelector = () => {
  const isMobile = useIsMobile();
  const isNavigationDrawerExpanded = useAtomStateValue(
    isNavigationDrawerExpandedState,
  );
  const {
    activeViewMode,
    isMyCompanyViewAvailable,
    setGroupView,
    setMyCompanyView,
  } = useEntityFilter();

  if (!isMobile && !isNavigationDrawerExpanded) {
    return null;
  }

  const onClickHandlers = {
    [ENTITY_FILTER_VIEW_MODE.MY_COMPANY]: setMyCompanyView,
    [ENTITY_FILTER_VIEW_MODE.GROUP]: setGroupView,
  };

  const getOptionOnClick = (mode: EntityFilterViewMode): (() => void) => {
    return onClickHandlers[mode] ?? (() => {});
  };

  const options: ViewModeOption[] = [
    {
      icon: IconBuildingSkyscraper,
      label: t`My company`,
      mode: ENTITY_FILTER_VIEW_MODE.MY_COMPANY,
      onClick: getOptionOnClick(ENTITY_FILTER_VIEW_MODE.MY_COMPANY),
    },
    {
      icon: IconSitemap,
      label: t`Group view`,
      mode: ENTITY_FILTER_VIEW_MODE.GROUP,
      onClick: getOptionOnClick(ENTITY_FILTER_VIEW_MODE.GROUP),
    },
  ];

  return (
    <StyledSelector aria-label={t`Entity view selector`} role="group">
      {options.map((option) => (
        <EntitySelectorButton
          key={option.mode}
          Icon={option.icon}
          disabled={
            option.mode === ENTITY_FILTER_VIEW_MODE.MY_COMPANY &&
            !isMyCompanyViewAvailable
          }
          isActive={activeViewMode === option.mode}
          label={option.label}
          onClick={option.onClick}
        />
      ))}
    </StyledSelector>
  );
};
