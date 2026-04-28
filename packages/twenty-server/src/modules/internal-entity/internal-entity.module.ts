import { Module } from '@nestjs/common';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { FieldMetadataModule } from 'src/engine/metadata-modules/field-metadata/field-metadata.module';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';

import { InitInternalEntitiesCommand } from 'src/modules/internal-entity/commands/init-internal-entities.command';
import { ImportCsvOpportunitiesCommand } from 'src/modules/internal-entity/commands/import-csv-opportunities.command';

@Module({
  imports: [
    WorkspaceIteratorModule,
    ObjectMetadataModule,
    FieldMetadataModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
  ],
  providers: [InitInternalEntitiesCommand, ImportCsvOpportunitiesCommand],
})
export class InternalEntityModule {}
