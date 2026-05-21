import { type ObjectRecord } from 'twenty-shared/types';

import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { InternalEntitySourceTaggingService } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging.service';

@WorkspaceQueryHook({
  key: `*.createOne`,
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class InternalEntitySourceTaggingCreateOnePostQueryHook
  implements WorkspacePostQueryHookInstance
{
  constructor(
    private readonly internalEntitySourceTaggingService: InternalEntitySourceTaggingService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    records: ObjectRecord[],
  ): Promise<void> {
    await this.internalEntitySourceTaggingService.createMembershipsForRecords({
      authContext,
      objectName,
      records,
    });
  }
}
