import {
  ENTITY_FILTER_VIEW_MODE,
  type EntityFilterViewMode,
} from '@/entity-filter/constants/entityFilterViewMode';
import { useEntityFilter } from '@/entity-filter/hooks/useEntityFilter';
import { useSelectableInternalEntities } from '@/entity-filter/hooks/useSelectableInternalEntities';
import { shouldResetPersistedEntityFilter } from '@/entity-filter/utils/shouldResetPersistedEntityFilter';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { GenericDropdownContentWidth } from '@/ui/layout/dropdown/constants/GenericDropdownContentWidth';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type ComponentType, useEffect } from 'react';
import {
  IconBuildingSkyscraper,
  IconCheck,
  IconChevronDown,
  IconSitemap,
  OverflowingTextWithTooltip,
} from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useIsMobile } from 'twenty-ui/utilities';

const ENTITY_SELECTOR_DROPDOWN_ID = 'entity-selector-dropdown';

const StyledSelectorButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[2]};
  height: ${themeCssVariables.spacing[8]};
  justify-content: space-between;
  min-width: 0;
  padding: 0 ${themeCssVariables.spacing[2]};
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.lighter};
  }
`;

const StyledSelectorButtonContent = styled.span`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1.5]};
  min-width: 0;
`;

const StyledSelectorIconContainer = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-shrink: 0;
`;

const StyledEntityColorDot = styled.span<{ entityColor: string | null }>`
  background: ${({ entityColor }) =>
    entityColor ?? themeCssVariables.background.transparent.medium};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.rounded};
  box-sizing: border-box;
  flex-shrink: 0;
  height: ${themeCssVariables.spacing[2]};
  width: ${themeCssVariables.spacing[2]};
`;

const StyledChevronContainer = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-shrink: 0;
`;

const StyledMenuItemButton = styled.button<{ isSelected: boolean }>`
  align-items: center;
  background: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.background.transparent.lighter
      : 'transparent'};
  border: 0;
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  height: ${themeCssVariables.spacing[8]};
  justify-content: space-between;
  padding: 0 ${themeCssVariables.spacing[2]};
  text-align: left;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.lighter};
  }
`;

const StyledMenuItemContent = styled.span`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledMenuItemLabel = styled.span`
  min-width: 0;
`;

const StyledCheckContainer = styled.span<{ isSelected: boolean }>`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-shrink: 0;
  visibility: ${({ isSelected }) => (isSelected ? 'visible' : 'hidden')};
`;

type EntitySelectorMenuItemProps = {
  color: string | null;
  icon?: ComponentType<{ size: string | number }>;
  isSelected: boolean;
  label: string;
  onClick: () => void;
};

const EntitySelectorMenuItem = ({
  color,
  icon: Icon,
  isSelected,
  label,
  onClick,
}: EntitySelectorMenuItemProps) => (
  <StyledMenuItemButton
    aria-selected={isSelected}
    isSelected={isSelected}
    onClick={onClick}
    role="option"
    type="button"
  >
    <StyledMenuItemContent>
      {Icon ? (
        <StyledSelectorIconContainer>
          <Icon size={themeCssVariables.icon.size.sm} />
        </StyledSelectorIconContainer>
      ) : (
        <StyledEntityColorDot entityColor={color} />
      )}
      <StyledMenuItemLabel>
        <OverflowingTextWithTooltip text={label} />
      </StyledMenuItemLabel>
    </StyledMenuItemContent>
    <StyledCheckContainer isSelected={isSelected}>
      <IconCheck size={themeCssVariables.icon.size.sm} />
    </StyledCheckContainer>
  </StyledMenuItemButton>
);

const resolveButtonIcon = (
  activeViewMode: EntityFilterViewMode,
): ComponentType<{ size: string | number }> =>
  activeViewMode === ENTITY_FILTER_VIEW_MODE.GROUP
    ? IconSitemap
    : IconBuildingSkyscraper;

export const EntitySelector = () => {
  const isMobile = useIsMobile();
  const isNavigationDrawerExpanded = useAtomStateValue(
    isNavigationDrawerExpandedState,
  );
  const { closeDropdown } = useCloseDropdown();
  const {
    activeViewMode,
    selectedEntityId,
    setGroupView,
    setSelectedEntityId,
  } = useEntityFilter();
  const { selectableInternalEntities, isLoading } =
    useSelectableInternalEntities({
      fallbackEntityLabel: t`My company`,
    });

  // IMP-20 : resynchronise le filtre persisté (localStorage) une fois les
  // entités sélectionnables chargées — si l'entité stockée n'appartient plus
  // à l'utilisateur, on retombe sur la Vue Groupe pour éviter un libellé
  // « Ma Société » qui ne correspond pas aux données réellement renvoyées.
  useEffect(() => {
    if (
      shouldResetPersistedEntityFilter({
        selectedEntityId,
        selectableEntityIds: selectableInternalEntities.map(
          (entity) => entity.id,
        ),
        isLoading,
      })
    ) {
      setGroupView();
    }
  }, [selectedEntityId, selectableInternalEntities, isLoading, setGroupView]);

  if (!isMobile && !isNavigationDrawerExpanded) {
    return null;
  }

  const selectedEntity = selectableInternalEntities.find(
    (entity) => entity.id === selectedEntityId,
  );
  const activeLabel =
    activeViewMode === ENTITY_FILTER_VIEW_MODE.GROUP
      ? t`Group view`
      : (selectedEntity?.name ?? t`My company`);
  const activeColor =
    activeViewMode === ENTITY_FILTER_VIEW_MODE.GROUP
      ? null
      : (selectedEntity?.color ?? null);
  const ButtonIcon = resolveButtonIcon(activeViewMode);

  const selectGroupView = () => {
    setGroupView();
    closeDropdown(ENTITY_SELECTOR_DROPDOWN_ID);
  };

  const selectEntity = (entityId: string) => {
    setSelectedEntityId(entityId);
    closeDropdown(ENTITY_SELECTOR_DROPDOWN_ID);
  };

  return (
    <Dropdown
      dropdownId={ENTITY_SELECTOR_DROPDOWN_ID}
      dropdownPlacement="bottom-start"
      clickableComponentWidth="100%"
      clickableComponent={
        <StyledSelectorButton
          aria-label={t`Entity view selector`}
          title={activeLabel}
          type="button"
        >
          <StyledSelectorButtonContent>
            {activeViewMode === ENTITY_FILTER_VIEW_MODE.GROUP ? (
              <StyledSelectorIconContainer>
                <ButtonIcon size={themeCssVariables.icon.size.sm} />
              </StyledSelectorIconContainer>
            ) : (
              <StyledEntityColorDot entityColor={activeColor} />
            )}
            <OverflowingTextWithTooltip text={activeLabel} />
          </StyledSelectorButtonContent>
          <StyledChevronContainer>
            <IconChevronDown size={themeCssVariables.icon.size.sm} />
          </StyledChevronContainer>
        </StyledSelectorButton>
      }
      dropdownComponents={
        <DropdownContent widthInPixels={GenericDropdownContentWidth.Medium}>
          <DropdownMenuItemsContainer>
            <EntitySelectorMenuItem
              color={null}
              icon={IconSitemap}
              isSelected={activeViewMode === ENTITY_FILTER_VIEW_MODE.GROUP}
              label={t`Group view`}
              onClick={selectGroupView}
            />
            {selectableInternalEntities.length > 0 && <DropdownMenuSeparator />}
            {selectableInternalEntities.map((entity) => (
              <EntitySelectorMenuItem
                key={entity.id}
                color={entity.color}
                isSelected={selectedEntityId === entity.id}
                label={entity.name}
                onClick={() => selectEntity(entity.id)}
              />
            ))}
          </DropdownMenuItemsContainer>
        </DropdownContent>
      }
    />
  );
};
