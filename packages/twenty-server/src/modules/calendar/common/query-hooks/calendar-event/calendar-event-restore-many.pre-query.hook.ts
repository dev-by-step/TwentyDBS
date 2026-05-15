import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type RestoreManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CalendarEventMutationPermissionService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/calendar-event-mutation-permission.service';

@WorkspaceQueryHook(`*.restoreMany`)
export class CalendarEventRestoreManyPreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly calendarEventMutationPermissionService: CalendarEventMutationPermissionService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: RestoreManyResolverArgs<Record<string, unknown>>,
  ): Promise<RestoreManyResolverArgs<Record<string, unknown>>> {
    await this.calendarEventMutationPermissionService.assertBulkMutationAllowed(
      authContext,
      objectName,
    );

    return payload;
  }
}
