import { Command } from 'nest-commander';

import {
  ActiveOrSuspendedWorkspaceCommandRunner,
  type ActiveOrSuspendedWorkspaceCommandOptions,
} from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SharedCalendarDemoService } from 'src/engine/core-modules/calendar/shared-calendar-demo.service';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

@Command({
  name: 'reset-shared-calendar-demo',
  description:
    'Réinitialise le calendrier partagé de démo du workspace principal Twenty DBS.',
})
export class ResetSharedCalendarDemoCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly sharedCalendarDemoService: SharedCalendarDemoService,
  ) {
    super(workspaceIteratorService);
  }

  override async run(
    passedParams: string[],
    options: ActiveOrSuspendedWorkspaceCommandOptions,
  ): Promise<void> {
    if (!options.workspaceId || options.workspaceId.size === 0) {
      options.workspaceId = new Set([SEED_APPLE_WORKSPACE_ID]);
    }

    await super.run(passedParams, options);
  }

  override async runOnWorkspace({
    workspaceId,
  }: RunOnWorkspaceArgs): Promise<void> {
    await this.sharedCalendarDemoService.resetSharedCalendarDemo({
      workspaceId,
    });

    this.logger.log(
      `Calendrier partagé de démo réinitialisé pour le workspace ${workspaceId}`,
    );
  }
}
