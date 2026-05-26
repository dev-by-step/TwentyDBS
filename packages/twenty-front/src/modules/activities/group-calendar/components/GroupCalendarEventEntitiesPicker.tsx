import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';

import { StyledField } from '@/activities/group-calendar/components/GroupCalendarEventDialogStyles';
import { StyledGroupCalendarSelectableChip } from '@/activities/group-calendar/components/GroupCalendarSelectableChip';
import { type ManageableEventEntity } from '@/activities/group-calendar/hooks/useManageableEventEntities';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledEntityPicker = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

type GroupCalendarEventEntitiesPickerProps = {
  manageableEventEntities: readonly ManageableEventEntity[];
  selectedEventEntityIds: readonly string[];
  onToggleEventEntity: (entityId: string) => void;
  emptyHint?: string;
};

// Single render path for both create and edit modals. Picks the right UX based
// on how many entities the current user can manage:
//   - 0 → explicit empty-state with caller-provided guidance.
//   - 1 → no picker (auto-selected), just a confirmation label.
//   - 2+ → toggle-able chip picker.
export const GroupCalendarEventEntitiesPicker = ({
  manageableEventEntities,
  selectedEventEntityIds,
  onToggleEventEntity,
  emptyHint,
}: GroupCalendarEventEntitiesPickerProps) => {
  return (
    <StyledField as="div">
      {t`Event entities`}
      {manageableEventEntities.length === 0 ? (
        <StyledHint>
          {emptyHint ??
            t`Your account is not attached to any entity. Ask an admin to add you to one before creating events.`}
        </StyledHint>
      ) : manageableEventEntities.length === 1 ? (
        <StyledHint>
          {selectedEventEntityIds.includes(manageableEventEntities[0].id)
            ? t`Event for ${manageableEventEntities[0].name}.`
            : t`Toggle ${manageableEventEntities[0].name} to attach this event.`}
        </StyledHint>
      ) : (
        <StyledEntityPicker>
          {manageableEventEntities.map((entity) => (
            <StyledGroupCalendarSelectableChip
              key={entity.id}
              type="button"
              selected={selectedEventEntityIds.includes(entity.id)}
              chipColor={entity.color}
              onClick={() => onToggleEventEntity(entity.id)}
            >
              {entity.name}
            </StyledGroupCalendarSelectableChip>
          ))}
        </StyledEntityPicker>
      )}
    </StyledField>
  );
};
