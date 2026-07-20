import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { RecordTableEmptyStateNoGroupNoRecordAtAll } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateNoGroupNoRecordAtAll';
import { RecordTableEmptyStateNoRecordFoundForFilter } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateNoRecordFoundForFilter';
import { RecordTableEmptyStateReadOnly } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateReadOnly';
import { RecordTableEmptyStateRemote } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateRemote';
import { RecordTableEmptyStateSoftDelete } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateSoftDelete';
import { isSoftDeleteFilterActiveComponentState } from '@/object-record/record-table/states/isSoftDeleteFilterActiveComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';

export const RecordTableEmptyState = () => {
  const { recordTableId, objectNameSingular, objectMetadataItem } =
    useRecordTableContextOrThrow();

  // Cette sonde répond à « existe-t-il le moindre enregistrement ? », pas
  // « en reste-t-il dans la vue courante ? » : elle doit donc ignorer le filtre
  // de vue « Ma société / Vue groupe ». Sans ce bypass, une vue d'entité qui
  // masque tous les enregistrements renvoyait totalCount = 0, et l'écran
  // affichait « Add your first… » alors que des enregistrements existent et
  // sont seulement filtrés. La portée réelle reste imposée par le serveur :
  // l'utilisateur ne compte jamais que des enregistrements de ses entités.
  const { totalCount } = useFindManyRecords({
    objectNameSingular,
    limit: 1,
    bypassEntityViewScope: true,
  });
  const noRecordAtAll = totalCount === 0;

  const isRemote = objectMetadataItem.isRemote;

  const isSoftDeleteFilterActive = useAtomComponentStateValue(
    isSoftDeleteFilterActiveComponentState,
    recordTableId,
  );

  const objectPermissions = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );

  const hasObjectUpdatePermissions = objectPermissions.canUpdateObjectRecords;

  if (!hasObjectUpdatePermissions) {
    return <RecordTableEmptyStateReadOnly />;
  }

  if (isRemote) {
    return <RecordTableEmptyStateRemote />;
  } else if (isSoftDeleteFilterActive === true) {
    return <RecordTableEmptyStateSoftDelete />;
  } else if (noRecordAtAll) {
    return <RecordTableEmptyStateNoGroupNoRecordAtAll />;
  } else {
    return <RecordTableEmptyStateNoRecordFoundForFilter />;
  }
};
