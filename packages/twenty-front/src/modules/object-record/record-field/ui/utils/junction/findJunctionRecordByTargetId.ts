import { isObjectWithId } from '@/object-record/record-field/ui/utils/junction/isObjectWithId';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isDefined } from 'twenty-shared/utils';

type FindJunctionRecordByTargetIdArgs = {
  junctionRecords: ObjectRecord[];
  targetRecordId: string;
  targetFieldName: string;
  targetJoinColumnName?: string;
};

export const findJunctionRecordByTargetId = ({
  junctionRecords,
  targetRecordId,
  targetFieldName,
  targetJoinColumnName,
}: FindJunctionRecordByTargetIdArgs): ObjectRecord | undefined => {
  for (const junctionRecord of junctionRecords) {
    if (!isDefined(junctionRecord)) {
      continue;
    }

    const targetObject = junctionRecord[targetFieldName];

    if (isObjectWithId(targetObject) && targetObject.id === targetRecordId) {
      return junctionRecord;
    }

    // Fallback for records loaded without the nested relation object
    // (e.g. after a refetch that only populated the join column).
    if (
      isDefined(targetJoinColumnName) &&
      junctionRecord[targetJoinColumnName] === targetRecordId
    ) {
      return junctionRecord;
    }
  }

  return undefined;
};
