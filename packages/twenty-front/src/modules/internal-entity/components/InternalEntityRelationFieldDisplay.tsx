import { useContext, useMemo, useState } from 'react';

import { RecordDetailRelationSectionDropdownToMany } from '@/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToMany';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useFieldFocus } from '@/object-record/record-field/ui/hooks/useFieldFocus';
import { useRelationFromManyFieldDisplay } from '@/object-record/record-field/ui/meta-types/hooks/useRelationFromManyFieldDisplay';
import { extractTargetRecordsFromJunction } from '@/object-record/record-field/ui/utils/junction/extractTargetRecordsFromJunction';
import { getJunctionConfig } from '@/object-record/record-field/ui/utils/junction/getJunctionConfig';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { Button } from 'twenty-ui/input';
import { IconPlus } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { ExpandableList } from '@/ui/layout/expandable-list/components/ExpandableList';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';

import { InternalEntityDetachConfirmationModal } from '@/internal-entity/components/InternalEntityDetachConfirmationModal';
import { useInternalEntityRelationFieldInfo } from '@/internal-entity/hooks/useInternalEntityRelationFieldInfo';
import { useUpdateJunctionRelationFromCell } from '@/object-record/record-field/ui/hooks/useUpdateJunctionRelationFromCell';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';

const INTERNAL_ENTITY_FALLBACK_COLOR = themeCssVariables.font.color.tertiary;

const StyledContainer = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  min-height: 24px;
  width: 100%;
`;

const StyledBadgesContainer = styled.div`
  min-width: 0;
  width: 100%;
`;

const StyledBadge = styled.button<{ entityColor: string }>`
  align-items: center;
  background: ${themeCssVariables.background.transparent.light};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  gap: ${themeCssVariables.spacing[1]};
  height: 24px;
  max-width: 100%;
  padding: 0 ${themeCssVariables.spacing[2]};

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
  }

  &:focus-visible {
    outline: 2px solid ${({ entityColor }) => entityColor};
    outline-offset: 1px;
  }
`;

const StyledBadgeDot = styled.span<{ entityColor: string }>`
  background: ${({ entityColor }) => entityColor};
  border-radius: 999px;
  flex-shrink: 0;
  height: 8px;
  width: 8px;
`;

const StyledBadgeLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEmptyText = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

type InternalEntityRecord = ObjectRecord & {
  color?: string | null;
  name?: string | null;
};

type InternalEntityRelationFieldDisplayContentProps = {
  fieldDefinition: FieldDefinition<FieldRelationMetadata>;
  fieldMetadataItem: NonNullable<
    ReturnType<typeof useInternalEntityRelationFieldInfo>['fieldMetadataItem']
  >;
  fieldValue: ObjectRecord[];
  internalEntityObjectMetadata: NonNullable<
    ReturnType<
      typeof useInternalEntityRelationFieldInfo
    >['internalEntityObjectMetadata']
  >;
  isRecordFieldReadOnly: boolean;
  objectMetadataItem: NonNullable<
    ReturnType<typeof useInternalEntityRelationFieldInfo>['objectMetadataItem']
  >;
  objectMetadataItems: ReturnType<
    typeof useObjectMetadataItems
  >['objectMetadataItems'];
  recordId: string;
  relationFieldDefinition: NonNullable<
    ReturnType<
      typeof useInternalEntityRelationFieldInfo
    >['relationFieldDefinition']
  >;
};

const InternalEntityRelationFieldDisplayContent = ({
  fieldDefinition,
  fieldMetadataItem,
  fieldValue,
  internalEntityObjectMetadata,
  isRecordFieldReadOnly,
  objectMetadataItem,
  objectMetadataItems,
  recordId,
  relationFieldDefinition,
}: InternalEntityRelationFieldDisplayContentProps) => {
  const { t } = useLingui();
  const { isFocused } = useFieldFocus();
  const { closeModal, openModal } = useModal();
  const [entityToDetach, setEntityToDetach] =
    useState<InternalEntityRecord | null>(null);

  const junctionConfig = getJunctionConfig({
    settings: fieldMetadataItem.settings,
    relationObjectMetadataId:
      relationFieldDefinition.metadata.relationObjectMetadataId,
    sourceObjectMetadataId: objectMetadataItem.id,
    objectMetadataItems,
  });

  const { updateJunctionRelationFromCell, isJunctionConfigValid } =
    useUpdateJunctionRelationFromCell({
      fieldMetadataItem,
      fieldDefinition: relationFieldDefinition,
      recordId,
    });

  const internalEntities = useMemo(() => {
    if (junctionConfig === null || junctionConfig.isMorphRelation) {
      return [];
    }

    return extractTargetRecordsFromJunction({
      junctionRecords: fieldValue,
      targetFields: junctionConfig.targetFields,
      objectMetadataItems,
      includeRecord: true,
    })
      .map((extractedRecord) => extractedRecord.record)
      .filter(isDefined) as InternalEntityRecord[];
  }, [fieldValue, junctionConfig, objectMetadataItems]);

  const confirmationModalId = `internal-entity-detach:${recordId}:${fieldDefinition.fieldMetadataId}`;

  const handleConfirmDetach = async () => {
    if (
      entityToDetach === null ||
      !isJunctionConfigValid ||
      !isDefined(entityToDetach.id)
    ) {
      return;
    }

    await updateJunctionRelationFromCell({
      morphItem: {
        recordId: entityToDetach.id,
        objectMetadataId: internalEntityObjectMetadata.id,
        isMatchingSearchFilter: true,
        isSelected: false,
      },
    });

    setEntityToDetach(null);
    closeModal(confirmationModalId);
  };

  const chips = internalEntities.map((internalEntity) => (
    <StyledBadge
      key={internalEntity.id}
      entityColor={internalEntity.color ?? INTERNAL_ENTITY_FALLBACK_COLOR}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setEntityToDetach(internalEntity);
        openModal(confirmationModalId);
      }}
      type="button"
    >
      <StyledBadgeDot
        entityColor={internalEntity.color ?? INTERNAL_ENTITY_FALLBACK_COLOR}
      />
      <StyledBadgeLabel>
        {internalEntity.name?.trim() || t`Untitled entity`}
      </StyledBadgeLabel>
    </StyledBadge>
  ));

  return (
    <>
      <StyledContainer>
        <StyledBadgesContainer>
          {chips.length > 0 ? (
            <ExpandableList isChipCountDisplayed={isFocused}>
              {chips}
            </ExpandableList>
          ) : (
            <StyledEmptyText>{t`No entity linked`}</StyledEmptyText>
          )}
        </StyledBadgesContainer>
        {!isRecordFieldReadOnly && (
          <RecordDetailRelationSectionDropdownToMany
            dropdownTriggerClickableComponent={
              <Button
                Icon={IconPlus}
                size="small"
                title={t`Add entity`}
                variant="secondary"
              />
            }
          />
        )}
      </StyledContainer>
      <InternalEntityDetachConfirmationModal
        modalInstanceId={confirmationModalId}
        entityLabel={entityToDetach?.name?.trim() || undefined}
        onConfirmClick={handleConfirmDetach}
        onClose={() => {
          setEntityToDetach(null);
        }}
      />
    </>
  );
};

export const InternalEntityRelationFieldDisplay = () => {
  const { fieldDefinition, recordId, isRecordFieldReadOnly } =
    useContext(FieldContext);
  const { fieldValue } = useRelationFromManyFieldDisplay();
  const { objectMetadataItems } = useObjectMetadataItems();
  const {
    fieldMetadataItem,
    internalEntityObjectMetadata,
    isInternalEntityRelation,
    objectMetadataItem,
    relationFieldDefinition,
  } = useInternalEntityRelationFieldInfo();

  if (
    !isInternalEntityRelation ||
    fieldMetadataItem === undefined ||
    internalEntityObjectMetadata === undefined ||
    objectMetadataItem === undefined ||
    relationFieldDefinition === undefined ||
    !Array.isArray(fieldValue)
  ) {
    return null;
  }

  return (
    <InternalEntityRelationFieldDisplayContent
      fieldDefinition={
        fieldDefinition as FieldDefinition<FieldRelationMetadata>
      }
      fieldMetadataItem={fieldMetadataItem}
      fieldValue={fieldValue}
      internalEntityObjectMetadata={internalEntityObjectMetadata}
      isRecordFieldReadOnly={isRecordFieldReadOnly}
      objectMetadataItem={objectMetadataItem}
      objectMetadataItems={objectMetadataItems}
      recordId={recordId}
      relationFieldDefinition={relationFieldDefinition}
    />
  );
};
