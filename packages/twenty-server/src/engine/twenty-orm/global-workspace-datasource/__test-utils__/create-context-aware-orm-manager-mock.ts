/**
 * Test helper that mimics the production behaviour of GlobalWorkspaceOrmManager:
 *   - `getRepository(...)` throws if called outside `executeInWorkspaceContext`.
 *   - `executeInWorkspaceContext(fn)` enters a virtual workspace context for the
 *     duration of `fn`, restores it on exit, and propagates rejections faithfully.
 *
 * Use it in unit tests to catch regressions where a service calls
 * `globalWorkspaceOrmManager.getRepository(...)` without wrapping it in
 * `executeInWorkspaceContext`. In production such a call throws
 * "Workspace context not set. Operations must be wrapped with withWorkspaceContext()".
 */
export type RepositoryFactory = (
  workspaceId: string,
  objectMetadataName: string,
  permissionOptions?: unknown,
) => Promise<unknown>;

export type ContextAwareOrmManagerMock = {
  manager: {
    getRepository: jest.Mock;
    executeInWorkspaceContext: jest.Mock;
  };
  isContextActive: () => boolean;
};

const WORKSPACE_CONTEXT_REQUIRED_ERROR =
  'Workspace context not set. Operations must be wrapped with withWorkspaceContext()';

export const createContextAwareOrmManagerMock = ({
  repositoryFactory,
}: {
  repositoryFactory: RepositoryFactory;
}): ContextAwareOrmManagerMock => {
  let activeContexts = 0;

  const getRepository = jest.fn(
    async (
      workspaceId: string,
      objectMetadataName: string,
      permissionOptions?: unknown,
    ) => {
      if (activeContexts === 0) {
        throw new Error(WORKSPACE_CONTEXT_REQUIRED_ERROR);
      }

      return repositoryFactory(workspaceId, objectMetadataName, permissionOptions);
    },
  );

  const executeInWorkspaceContext = jest.fn(
    async (fn: () => unknown | Promise<unknown>) => {
      activeContexts += 1;

      try {
        return await fn();
      } finally {
        activeContexts -= 1;
      }
    },
  );

  return {
    manager: { getRepository, executeInWorkspaceContext },
    isContextActive: () => activeContexts > 0,
  };
};
