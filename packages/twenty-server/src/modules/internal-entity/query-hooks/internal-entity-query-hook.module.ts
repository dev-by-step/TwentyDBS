import { Module } from '@nestjs/common';

import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { InternalEntitySourceTaggingCreateManyPostQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging-create-many.post-query-hook';
import { InternalEntitySourceTaggingCreateManyPreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging-create-many.pre-query-hook';
import { InternalEntitySourceTaggingCreateOnePostQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging-create-one.post-query-hook';
import { InternalEntitySourceTaggingCreateOnePreQueryHook } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging-create-one.pre-query-hook';
import { InternalEntitySourceTaggingService } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging.service';

@Module({
  imports: [GlobalWorkspaceDataSourceModule, ObjectMetadataModule],
  providers: [
    InternalEntitySourceTaggingService,
    InternalEntitySourceTaggingCreateOnePreQueryHook,
    InternalEntitySourceTaggingCreateManyPreQueryHook,
    InternalEntitySourceTaggingCreateOnePostQueryHook,
    InternalEntitySourceTaggingCreateManyPostQueryHook,
  ],
})
export class InternalEntityQueryHookModule {}
