import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import {
  IconCheck,
  IconChevronDown,
  IconSitemap,
  OverflowingTextWithTooltip,
} from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { groupCalendarEntityFilterState } from '@/activities/group-calendar/states/groupCalendarEntityFilterState';
import { useSelectableInternalEntities } from '@/entity-filter/hooks/useSelectableInternalEntities';
import { shouldResetPersistedEntityFilter } from '@/entity-filter/utils/shouldResetPersistedEntityFilter';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { GenericDropdownContentWidth } from '@/ui/layout/dropdown/constants/GenericDropdownContentWidth';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

const GROUP_CALENDAR_ENTITY_FILTER_DROPDOWN_ID =
  'group-calendar-entity-filter-dropdown';

const StyledSelectorButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1.5]};
  height: ${themeCssVariables.spacing[6]};
  max-width: 160px;
  padding: 0 ${themeCssVariables.spacing[2]};

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
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

type EntityFilterMenuItemProps = {
  color: string | null;
  isSelected: boolean;
  label: string;
  onClick: () => void;
};

const EntityFilterMenuItem = ({
  color,
  isSelected,
  label,
  onClick,
}: EntityFilterMenuItemProps) => (
  <StyledMenuItemButton
    aria-selected={isSelected}
    isSelected={isSelected}
    onClick={onClick}
    role="option"
    type="button"
  >
    <StyledMenuItemContent>
      {color === null ? (
        <StyledSelectorIconContainer>
          <IconSitemap size={themeCssVariables.icon.size.sm} />
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

// IMP (docs/AUDIT-BACKLOG.md) : filtre « voir uniquement cette entité » propre
// au Calendrier Groupe. Contrairement au sélecteur global de la barre
// latérale (Ma Société / Vue Groupe), qui ne pilote que le masquage sur cette
// page (FIX-40), une entité choisie ici EXCLUT réellement les événements des
// autres entités du résultat — choix produit assumé, voir
// groupCalendarEntityFilterState.ts.
export const GroupCalendarEntityFilterSelector = () => {
  const { closeDropdown } = useCloseDropdown();
  const [groupCalendarEntityFilter, setGroupCalendarEntityFilter] =
    useAtomState(groupCalendarEntityFilterState);
  const { selectableInternalEntities, isLoading } =
    useSelectableInternalEntities({
      fallbackEntityLabel: t`My company`,
    });

  useEffect(() => {
    if (
      shouldResetPersistedEntityFilter({
        selectedEntityId: groupCalendarEntityFilter,
        selectableEntityIds: selectableInternalEntities.map(
          (entity) => entity.id,
        ),
        isLoading,
      })
    ) {
      setGroupCalendarEntityFilter(null);
    }
  }, [
    groupCalendarEntityFilter,
    selectableInternalEntities,
    isLoading,
    setGroupCalendarEntityFilter,
  ]);

  if (selectableInternalEntities.length <= 1) {
    return null;
  }

  const selectedEntity = selectableInternalEntities.find(
    (entity) => entity.id === groupCalendarEntityFilter,
  );
  const activeLabel = selectedEntity?.name ?? t`All entities`;
  const activeColor = selectedEntity?.color ?? null;

  const selectAllEntities = () => {
    setGroupCalendarEntityFilter(null);
    closeDropdown(GROUP_CALENDAR_ENTITY_FILTER_DROPDOWN_ID);
  };

  const selectEntity = (entityId: string) => {
    setGroupCalendarEntityFilter(entityId);
    closeDropdown(GROUP_CALENDAR_ENTITY_FILTER_DROPDOWN_ID);
  };

  return (
    <Dropdown
      dropdownId={GROUP_CALENDAR_ENTITY_FILTER_DROPDOWN_ID}
      dropdownPlacement="bottom-end"
      clickableComponent={
        <StyledSelectorButton
          aria-label={t`Calendar entity filter`}
          title={activeLabel}
          type="button"
        >
          {activeColor === null ? (
            <StyledSelectorIconContainer>
              <IconSitemap size={themeCssVariables.icon.size.sm} />
            </StyledSelectorIconContainer>
          ) : (
            <StyledEntityColorDot entityColor={activeColor} />
          )}
          <OverflowingTextWithTooltip text={activeLabel} />
          <StyledChevronContainer>
            <IconChevronDown size={themeCssVariables.icon.size.sm} />
          </StyledChevronContainer>
        </StyledSelectorButton>
      }
      dropdownComponents={
        <DropdownContent widthInPixels={GenericDropdownContentWidth.Medium}>
          <DropdownMenuItemsContainer>
            <EntityFilterMenuItem
              color={null}
              isSelected={groupCalendarEntityFilter === null}
              label={t`All entities`}
              onClick={selectAllEntities}
            />
            <DropdownMenuSeparator />
            {selectableInternalEntities.map((entity) => (
              <EntityFilterMenuItem
                key={entity.id}
                color={entity.color}
                isSelected={groupCalendarEntityFilter === entity.id}
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
