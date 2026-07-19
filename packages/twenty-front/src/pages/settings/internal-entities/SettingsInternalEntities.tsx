import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';

import { INTERNAL_ENTITY_OBJECT_NAME_SINGULAR } from '@/activities/group-calendar/constants/CalendarEventAudience';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { SubMenuTopBarContainer } from '@/ui/layout/page/components/SubMenuTopBarContainer';
import { ThemeColorPickerMenu } from '@/ui/input/components/ThemeColorPickerMenu';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { H2Title, IconColorSwatch } from 'twenty-ui/display';
import { LightIconButton } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import {
  MAIN_COLORS_LIGHT,
  MAIN_COLOR_NAMES,
  type ThemeColor,
} from 'twenty-ui/theme';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type InternalEntityRecord = {
  __typename: string;
  id: string;
  name: string;
  color: string | null;
};

const StyledTable = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
`;

const StyledRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};

  &:last-child {
    border-bottom: none;
  }
`;

const StyledEntityName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  flex: 1 0 auto;
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledColorSwatch = styled.span<{ swatchColor: string | null }>`
  background: ${({ swatchColor }) =>
    swatchColor ?? themeCssVariables.background.transparent.medium};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 50%;
  display: inline-block;
  height: ${themeCssVariables.spacing[5]};
  width: ${themeCssVariables.spacing[5]};
`;

const StyledEmptyText = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

// Reverse-resolves a stored hex value into the closest Twenty theme color name
// so the picker shows the matching selected state. Falls back to the first
// theme color when the entity is using an off-palette hex (e.g. legacy data).
const resolvePaletteNameFromHex = (hexColor: string | null): ThemeColor => {
  if (!isDefined(hexColor)) {
    return MAIN_COLOR_NAMES[0];
  }

  const normalized = hexColor.toLowerCase();
  const match = MAIN_COLOR_NAMES.find(
    (themeColor) => MAIN_COLORS_LIGHT[themeColor].toLowerCase() === normalized,
  );

  return match ?? MAIN_COLOR_NAMES[0];
};

const ENTITY_COLOR_DROPDOWN_PREFIX = 'internal-entity-color-picker:';

const SettingsInternalEntityRow = ({
  entity,
  onColorSelected,
}: {
  entity: InternalEntityRecord;
  onColorSelected: (entityId: string, colorHex: string) => Promise<void>;
}) => {
  const { closeDropdown } = useCloseDropdown();
  const dropdownId = `${ENTITY_COLOR_DROPDOWN_PREFIX}${entity.id}`;
  const selectedPaletteName = resolvePaletteNameFromHex(entity.color);

  return (
    <StyledRow>
      <StyledColorSwatch swatchColor={entity.color} />
      <StyledEntityName>{entity.name}</StyledEntityName>
      <Dropdown
        dropdownId={dropdownId}
        clickableComponent={
          <LightIconButton
            accent="secondary"
            Icon={IconColorSwatch}
            size="small"
            title={t`Change color`}
          />
        }
        dropdownComponents={
          <DropdownContent>
            <ThemeColorPickerMenu
              selectedColor={selectedPaletteName}
              onSelectColor={(nextColor) => {
                const nextHex = MAIN_COLORS_LIGHT[nextColor];

                onColorSelected(entity.id, nextHex);
                closeDropdown(dropdownId);
              }}
            />
          </DropdownContent>
        }
      />
    </StyledRow>
  );
};

export const SettingsInternalEntities = () => {
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { updateOneRecord } = useUpdateOneRecord();

  // FIX-32 : cet écran d'administration doit proposer une couleur pour *chaque*
  // entité interne. Sans ce bypass, le filtre de vue « Ma société / Vue groupe »
  // réduisait la liste à la seule entité active — un platform admin ne pouvait
  // donc pas configurer les autres. La portée effective reste imposée par le
  // serveur (qui n'exempte en lecture que les platform admins), un utilisateur
  // non-admin continue de ne voir que son entité.
  const { records: internalEntities = [], loading } =
    useFindManyRecords<InternalEntityRecord>({
      objectNameSingular: INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
      recordGqlFields: { id: true, name: true, color: true },
      bypassEntityViewScope: true,
    });

  const sortedEntities = [...internalEntities].sort(
    (firstEntity, secondEntity) =>
      firstEntity.name.localeCompare(secondEntity.name),
  );

  const handleColorSelected = async (entityId: string, colorHex: string) => {
    try {
      await updateOneRecord({
        objectNameSingular: INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
        idToUpdate: entityId,
        updateOneRecordInput: { color: colorHex },
      });

      enqueueSuccessSnackBar({ message: t`Entity color updated.` });
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error ? error.message : t`Failed to update color.`,
      });
    }
  };

  return (
    <SubMenuTopBarContainer
      title={t`Internal entities`}
      links={[
        {
          children: t`Workspace`,
          href: getSettingsPath(SettingsPath.Workspace),
        },
        { children: t`Internal entities` },
      ]}
    >
      <SettingsPageContainer>
        <Section>
          <H2Title
            title={t`Entity colors`}
            description={t`Pick a color for each internal entity. The selected color is used for its badge across the calendar and any other entity display in the workspace.`}
          />
          {loading ? (
            <StyledEmptyText>{t`Loading entities…`}</StyledEmptyText>
          ) : sortedEntities.length === 0 ? (
            <StyledEmptyText>
              {t`No internal entity yet. Run init-internal-entities to seed them.`}
            </StyledEmptyText>
          ) : (
            <StyledTable>
              {sortedEntities.map((entity) => (
                <SettingsInternalEntityRow
                  key={entity.id}
                  entity={entity}
                  onColorSelected={handleColorSelected}
                />
              ))}
            </StyledTable>
          )}
        </Section>
      </SettingsPageContainer>
    </SubMenuTopBarContainer>
  );
};
