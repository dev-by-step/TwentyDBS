import { getJoinObjectNameSingular } from '@/activities/utils/getJoinObjectNameSingular';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type CoreObjectNameSingular } from 'twenty-shared/types';

export const useCanCreateActivity = ({
  activityObjectNameSingular,
}: {
  activityObjectNameSingular:
    | CoreObjectNameSingular.Note
    | CoreObjectNameSingular.Task;
}) => {
  const { objectMetadataItem: activityObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: activityObjectNameSingular,
    });

  const { objectMetadataItem: activityTargetObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: getJoinObjectNameSingular(activityObjectNameSingular),
    });

  const activityObjectPermissions = useObjectPermissionsForObject(
    activityObjectMetadataItem.id,
  );

  const activityTargetObjectPermissions = useObjectPermissionsForObject(
    activityTargetObjectMetadataItem.id,
  );

  return (
    activityObjectPermissions.canUpdateObjectRecords &&
    activityTargetObjectPermissions.canUpdateObjectRecords
  );
};
