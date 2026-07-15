import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type DeleteManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { InternalEntityAccessPolicyService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service';

@WorkspaceQueryHook(`*.deleteMany`)
export class InternalEntityAccessDeleteManyPreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly internalEntityAccessPolicyService: InternalEntityAccessPolicyService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: DeleteManyResolverArgs<Record<string, unknown>>,
  ): Promise<DeleteManyResolverArgs<Record<string, unknown>>> {
    return this.internalEntityAccessPolicyService.scopeBulkMutationPayload(
      authContext,
      objectName,
      payload,
    );
  }
}
