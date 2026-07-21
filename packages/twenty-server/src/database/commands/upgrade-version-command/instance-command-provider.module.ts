import { Module } from '@nestjs/common';

import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';

@Module({
  imports: [WorkspaceCacheModule],
  providers: [...INSTANCE_COMMANDS],
})
export class InstanceCommandProviderModule {}
