import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type FindManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { InternalEntityAccessPolicyService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service';

@WorkspaceQueryHook(`*.findMany`)
export class InternalEntityAccessFindManyPreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly internalEntityAccessPolicyService: InternalEntityAccessPolicyService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: FindManyResolverArgs<Record<string, unknown>>,
  ): Promise<FindManyResolverArgs<Record<string, unknown>>> {
    return this.internalEntityAccessPolicyService.scopeFindManyPayload(
      authContext,
      objectName,
      payload,
    );
  }
}
