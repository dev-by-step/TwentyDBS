import { Module } from '@nestjs/common';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { DeduplicateInternalEntityMembershipsCommand } from 'src/database/commands/upgrade-version-command/2-1/2-1-workspace-command-1780000006000-deduplicate-internal-entity-memberships.command';
import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';

@Module({
  imports: [ObjectMetadataModule, WorkspaceIteratorModule],
  providers: [DeduplicateInternalEntityMembershipsCommand],
})
export class V2_1_UpgradeVersionCommandModule {}
