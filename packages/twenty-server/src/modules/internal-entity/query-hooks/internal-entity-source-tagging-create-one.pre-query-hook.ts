import { type ObjectRecord } from 'twenty-shared/types';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { InternalEntitySourceTaggingService } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging.service';

@WorkspaceQueryHook(`*.createOne`)
export class InternalEntitySourceTaggingCreateOnePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly internalEntitySourceTaggingService: InternalEntitySourceTaggingService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateOneResolverArgs<Partial<ObjectRecord>>,
  ): Promise<CreateOneResolverArgs<Partial<ObjectRecord>>> {
    return this.internalEntitySourceTaggingService.tagCreateOnePayload(
      authContext,
      objectName,
      payload,
    );
  }
}
