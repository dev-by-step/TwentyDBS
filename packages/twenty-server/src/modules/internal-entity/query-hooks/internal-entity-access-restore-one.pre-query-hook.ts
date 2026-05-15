import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type RestoreOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { InternalEntityAccessPolicyService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service';

@WorkspaceQueryHook(`*.restoreOne`)
export class InternalEntityAccessRestoreOnePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly internalEntityAccessPolicyService: InternalEntityAccessPolicyService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: RestoreOneResolverArgs,
  ): Promise<RestoreOneResolverArgs> {
    await this.internalEntityAccessPolicyService.assertSingleMutationAllowed(
      authContext,
      objectName,
      payload.id,
      'restoreOne',
    );

    return payload;
  }
}
