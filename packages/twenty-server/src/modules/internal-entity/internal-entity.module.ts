import { Module } from '@nestjs/common';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { RoleModule } from 'src/engine/metadata-modules/role/role.module';
import { FieldMetadataModule } from 'src/engine/metadata-modules/field-metadata/field-metadata.module';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';

import { InitInternalEntitiesCommand } from 'src/modules/internal-entity/commands/init-internal-entities.command';
import { ImportCsvOpportunitiesCommand } from 'src/modules/internal-entity/commands/import-csv-opportunities.command';
import { ImportCsvOpportunitiesParserService } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

@Module({
  imports: [
    WorkspaceIteratorModule,
    ObjectMetadataModule,
    FieldMetadataModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
    RoleModule,
  ],
  providers: [
    InitInternalEntitiesCommand,
    ImportCsvOpportunitiesCommand,
    ImportCsvOpportunitiesParserService,
  ],
})
export class InternalEntityModule {}
