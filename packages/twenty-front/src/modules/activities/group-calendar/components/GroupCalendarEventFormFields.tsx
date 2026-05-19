import { type ReactNode } from 'react';
import { t } from '@lingui/core/macro';
import { format } from 'date-fns';

import { GroupCalendarAudienceSection } from '@/activities/group-calendar/components/GroupCalendarAudienceSection';
import {
  StyledField,
  StyledInput,
} from '@/activities/group-calendar/components/GroupCalendarEventDialogStyles';
import { type AudienceMode } from '@/activities/group-calendar/constants/CalendarEventAudience';

export type GroupCalendarEventFormState = {
  title: string;
  startsAt: string;
  endsAt: string;
  audienceMode: AudienceMode;
  selectedAudienceEntityIds: string[];
  selectedAudienceMemberIds: string[];
};

export const formatDateTimeInputValue = (date: Date) =>
  format(date, "yyyy-MM-dd'T'HH:mm");

type GroupCalendarEventFormFieldsProps = {
  state: GroupCalendarEventFormState;
  onPatchState: (patch: Partial<GroupCalendarEventFormState>) => void;
  isAudienceFeatureAvailable: boolean;
  isPersonAudienceFeatureAvailable: boolean;
  afterTitleField?: ReactNode;
  autoFocus?: boolean;
};

export const GroupCalendarEventFormFields = ({
  state,
  onPatchState,
  isAudienceFeatureAvailable,
  isPersonAudienceFeatureAvailable,
  afterTitleField,
  autoFocus = true,
}: GroupCalendarEventFormFieldsProps) => {
  const toggleAudienceEntity = (entityId: string) => {
    onPatchState({
      selectedAudienceEntityIds: state.selectedAudienceEntityIds.includes(
        entityId,
      )
        ? state.selectedAudienceEntityIds.filter((id) => id !== entityId)
        : [...state.selectedAudienceEntityIds, entityId],
    });
  };

  const toggleAudienceMember = (workspaceMemberId: string) => {
    onPatchState({
      selectedAudienceMemberIds: state.selectedAudienceMemberIds.includes(
        workspaceMemberId,
      )
        ? state.selectedAudienceMemberIds.filter(
            (id) => id !== workspaceMemberId,
          )
        : [...state.selectedAudienceMemberIds, workspaceMemberId],
    });
  };

  return (
    <>
      <StyledField>
        {t`Title`}
        <StyledInput
          autoFocus={autoFocus}
          value={state.title}
          onChange={(event) => onPatchState({ title: event.target.value })}
          required
        />
      </StyledField>
      {afterTitleField}
      <StyledField>
        {t`Starts at`}
        <StyledInput
          type="datetime-local"
          value={state.startsAt}
          onChange={(event) => onPatchState({ startsAt: event.target.value })}
          required
        />
      </StyledField>
      <StyledField>
        {t`Ends at`}
        <StyledInput
          type="datetime-local"
          value={state.endsAt}
          onChange={(event) => onPatchState({ endsAt: event.target.value })}
          required
        />
      </StyledField>
      {isAudienceFeatureAvailable && (
        <GroupCalendarAudienceSection
          audienceMode={state.audienceMode}
          selectedAudienceEntityIds={state.selectedAudienceEntityIds}
          selectedAudienceMemberIds={state.selectedAudienceMemberIds}
          isPersonAudienceFeatureAvailable={isPersonAudienceFeatureAvailable}
          onAudienceModeChange={(audienceMode) =>
            onPatchState({ audienceMode })
          }
          onToggleAudienceEntity={toggleAudienceEntity}
          onToggleAudienceMember={toggleAudienceMember}
        />
      )}
    </>
  );
};
