import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type DeleteOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { InternalEntityAccessPolicyService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service';

@WorkspaceQueryHook(`*.deleteOne`)
export class InternalEntityAccessDeleteOnePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly internalEntityAccessPolicyService: InternalEntityAccessPolicyService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: DeleteOneResolverArgs,
  ): Promise<DeleteOneResolverArgs> {
    await this.internalEntityAccessPolicyService.assertSingleMutationAllowed(
      authContext,
      objectName,
      payload.id,
      'deleteOne',
    );

    return payload;
  }
}
