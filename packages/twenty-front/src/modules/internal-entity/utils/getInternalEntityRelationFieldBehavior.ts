import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import {
  getJunctionConfig,
  type JunctionObjectMetadataItem,
} from '@/object-record/record-field/ui/utils/junction/getJunctionConfig';
import { hasJunctionConfig } from '@/object-record/record-field/ui/utils/junction/hasJunctionConfig';
import { FieldDisplayMode } from '~/generated-metadata/graphql';

import { INTERNAL_ENTITY_OBJECT_NAME_SINGULAR } from '@/internal-entity/constants/InternalEntityObjectNameSingular';

export type InternalEntityRelationFieldBehavior = {
  canCreateTargetRecord: false;
  fieldWidgetDisplayMode: FieldDisplayMode.FIELD;
  internalEntityObjectMetadataId: string;
  requiresDetachConfirmation: true;
  shouldDisplayContentWhenEmpty: true;
  shouldRenderWithFieldWidgetDisplay: true;
};

export const getInternalEntityRelationFieldBehavior = ({
  fieldMetadataItem,
  sourceObjectMetadataId,
  objectMetadataItems,
}: {
  fieldMetadataItem: Pick<FieldMetadataItem, 'settings' | 'relation'>;
  sourceObjectMetadataId: string | undefined;
  objectMetadataItems: JunctionObjectMetadataItem[];
}): InternalEntityRelationFieldBehavior | null => {
  if (!hasJunctionConfig(fieldMetadataItem.settings)) {
    return null;
  }

  const relationObjectMetadataId =
    fieldMetadataItem.relation?.targetObjectMetadata.id;

  if (
    relationObjectMetadataId === undefined ||
    sourceObjectMetadataId === undefined
  ) {
    return null;
  }

  const junctionConfig = getJunctionConfig({
    settings: fieldMetadataItem.settings,
    relationObjectMetadataId,
    sourceObjectMetadataId,
    objectMetadataItems,
  });

  if (junctionConfig === null || junctionConfig.isMorphRelation) {
    return null;
  }

  const internalEntityTargetField = junctionConfig.targetFields.find(
    (targetField) =>
      targetField.relation?.targetObjectMetadata.nameSingular ===
      INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
  );

  if (internalEntityTargetField === undefined) {
    return null;
  }

  const internalEntityObjectMetadataId =
    internalEntityTargetField.relation?.targetObjectMetadata.id;

  if (internalEntityObjectMetadataId === undefined) {
    return null;
  }

  return {
    canCreateTargetRecord: false,
    fieldWidgetDisplayMode: FieldDisplayMode.FIELD,
    internalEntityObjectMetadataId,
    requiresDetachConfirmation: true,
    shouldDisplayContentWhenEmpty: true,
    shouldRenderWithFieldWidgetDisplay: true,
  };
};
