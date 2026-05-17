import { Module } from '@nestjs/common';

import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

@Module({
  imports: [GlobalWorkspaceDataSourceModule, ObjectMetadataModule],
  providers: [WorkspaceMemberInternalEntityService],
  exports: [WorkspaceMemberInternalEntityService],
})
export class WorkspaceMemberInternalEntityModule {}
