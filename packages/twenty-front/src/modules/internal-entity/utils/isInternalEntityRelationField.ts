import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type JunctionObjectMetadataItem } from '@/object-record/record-field/ui/utils/junction/getJunctionConfig';
import { getInternalEntityRelationFieldBehavior } from '@/internal-entity/utils/getInternalEntityRelationFieldBehavior';

export const isInternalEntityRelationField = ({
  fieldMetadataItem,
  sourceObjectMetadataId,
  objectMetadataItems,
}: {
  fieldMetadataItem: Pick<FieldMetadataItem, 'settings' | 'relation'>;
  sourceObjectMetadataId: string | undefined;
  objectMetadataItems: JunctionObjectMetadataItem[];
}): boolean =>
  getInternalEntityRelationFieldBehavior({
    fieldMetadataItem,
    sourceObjectMetadataId,
    objectMetadataItems,
  }) !== null;
