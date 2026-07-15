import { Module } from '@nestjs/common';

import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';
import { InternalEntityAccessCreateManyPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-create-many.pre-query-hook';
import { InternalEntityAccessCreateOnePreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-create-one.pre-query-hook';
import { InternalEntityAccessDeleteManyPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-delete-many.pre-query-hook';
import { InternalEntityAccessDeleteOnePreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-delete-one.pre-query-hook';
import { InternalEntityAccessDestroyManyPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-destroy-many.pre-query-hook';
import { InternalEntityAccessDestroyOnePreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-destroy-one.pre-query-hook';
import { InternalEntityAccessFindManyPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-find-many.pre-query-hook';
import { InternalEntityAccessFindDuplicatesPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-find-duplicates.pre-query-hook';
import { InternalEntityAccessFindOnePreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-find-one.pre-query-hook';
import { InternalEntityAccessGroupByPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-group-by.pre-query-hook';
import { InternalEntityAccessMergeManyPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-merge-many.pre-query-hook';
import { InternalEntityAccessRestoreManyPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-restore-many.pre-query-hook';
import { InternalEntityAccessRestoreOnePreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-restore-one.pre-query-hook';
import { InternalEntityAccessUpdateManyPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-update-many.pre-query-hook';
import { InternalEntityAccessUpdateOnePreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-access-update-one.pre-query-hook';
import { InternalEntitySourceTaggingCreateManyPostQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging-create-many.post-query-hook';
import { InternalEntitySourceTaggingCreateManyPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging-create-many.pre-query-hook';
import { InternalEntitySourceTaggingCreateOnePostQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging-create-one.post-query-hook';
import { InternalEntitySourceTaggingCreateOnePreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging-create-one.pre-query-hook';
import { InternalEntitySourceTaggingService } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging.service';
import { InternalEntityAccessPolicyService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service';
import { WorkspaceMemberInternalEntityModule } from 'src/modules/internal-entity/services/workspace-member-internal-entity.module';

@Module({
  imports: [
    GlobalWorkspaceDataSourceModule,
    ObjectMetadataModule,
    UserRoleModule,
    WorkspaceMemberInternalEntityModule,
  ],
  providers: [
    InternalEntityAccessPolicyService,
    InternalEntityAccessCreateOnePreQueryHook,
    InternalEntityAccessCreateManyPreQueryHook,
    InternalEntityAccessFindManyPreQueryHook,
    InternalEntityAccessFindOnePreQueryHook,
    InternalEntityAccessGroupByPreQueryHook,
    InternalEntityAccessFindDuplicatesPreQueryHook,
    InternalEntityAccessMergeManyPreQueryHook,
    InternalEntityAccessUpdateManyPreQueryHook,
    InternalEntityAccessUpdateOnePreQueryHook,
    InternalEntityAccessDeleteManyPreQueryHook,
    InternalEntityAccessDeleteOnePreQueryHook,
    InternalEntityAccessDestroyManyPreQueryHook,
    InternalEntityAccessDestroyOnePreQueryHook,
    InternalEntityAccessRestoreManyPreQueryHook,
    InternalEntityAccessRestoreOnePreQueryHook,
    InternalEntitySourceTaggingService,
    InternalEntitySourceTaggingCreateOnePreQueryHook,
    InternalEntitySourceTaggingCreateManyPreQueryHook,
    InternalEntitySourceTaggingCreateOnePostQueryHook,
    InternalEntitySourceTaggingCreateManyPostQueryHook,
  ],
})
export class InternalEntityQueryHookModule {}
