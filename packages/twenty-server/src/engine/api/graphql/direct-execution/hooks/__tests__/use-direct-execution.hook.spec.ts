import { parse } from 'graphql';

import { useDirectExecution } from 'src/engine/api/graphql/direct-execution/hooks/use-direct-execution.hook';

describe('useDirectExecution', () => {
  it('should execute workspace queries from parsed params when req.body is empty', async () => {
    const request = new Request('http://localhost:3000/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const expressRequest = {
      body: undefined,
      workspace: { id: 'workspace-id' },
    } as any;

    const directExecutionService = {
      getWorkspaceResolverNames: jest
        .fn()
        .mockResolvedValue(new Set(['companies'])),
      execute: jest.fn().mockResolvedValue({
        data: { companies: { totalCount: 0 } },
      }),
    } as any;

    const plugin = useDirectExecution({
      directExecutionService,
      featureFlagService: {} as any,
    });

    plugin.onRequest?.({
      request,
      serverContext: { req: expressRequest } as any,
      fetchAPI: globalThis,
      setRequest: jest.fn(),
      requestHandler: jest.fn() as any,
      setRequestHandler: jest.fn(),
      endResponse: jest.fn(),
      url: new URL(request.url),
    });

    const setResult = jest.fn();

    await plugin.onParams?.({
      request,
      params: {
        operationName: 'AggregateCompanies',
        query: `query AggregateCompanies($filter: CompanyFilterInput) {
          companies(filter: $filter) {
            totalCount
          }
        }`,
        variables: {
          filter: {
            id: {
              eq: 'company-id',
            },
          },
        },
      },
      setParams: jest.fn(),
      setResult,
      fetchAPI: globalThis,
    });

    expect(
      directExecutionService.getWorkspaceResolverNames,
    ).toHaveBeenCalledWith('workspace-id');
    expect(directExecutionService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        req: expressRequest,
        document: parse(`query AggregateCompanies($filter: CompanyFilterInput) {
          companies(filter: $filter) {
            totalCount
          }
        }`),
        operationName: 'AggregateCompanies',
        variables: {
          filter: {
            id: {
              eq: 'company-id',
            },
          },
        },
        hasIntrospectionFields: false,
        hasWorkspaceFields: true,
      }),
    );
    expect(setResult).toHaveBeenCalledWith({
      data: { companies: { totalCount: 0 } },
    });
  });

  it('should leave pure core queries to graphql-yoga', async () => {
    const request = new Request('http://localhost:3000/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const directExecutionService = {
      getWorkspaceResolverNames: jest
        .fn()
        .mockResolvedValue(new Set(['companies'])),
      execute: jest.fn(),
    } as any;

    const plugin = useDirectExecution({
      directExecutionService,
      featureFlagService: {} as any,
    });

    plugin.onRequest?.({
      request,
      serverContext: {
        req: {
          workspace: { id: 'workspace-id' },
        },
      } as any,
      fetchAPI: globalThis,
      setRequest: jest.fn(),
      requestHandler: jest.fn() as any,
      setRequestHandler: jest.fn(),
      endResponse: jest.fn(),
      url: new URL(request.url),
    });

    const setResult = jest.fn();

    await plugin.onParams?.({
      request,
      params: {
        operationName: 'CurrentWorkspace',
        query: `query CurrentWorkspace {
          currentWorkspace {
            id
          }
        }`,
        variables: {},
      },
      setParams: jest.fn(),
      setResult,
      fetchAPI: globalThis,
    });

    expect(directExecutionService.execute).not.toHaveBeenCalled();
    expect(setResult).not.toHaveBeenCalled();
  });

  it('should fallback to parsed params when yoga request instances differ', async () => {
    const requestAtOnRequest = new Request('http://localhost:3000/graphql', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
        'x-active-internal-entity-id': '550e8400-e29b-41d4-a716-446655440001',
        'x-schema-version': '87',
      },
      body: JSON.stringify({}),
    });

    const requestAtOnParams = new Request('http://localhost:3000/graphql', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
        'x-active-internal-entity-id': '550e8400-e29b-41d4-a716-446655440001',
        'x-schema-version': '87',
      },
      body: JSON.stringify({}),
    });

    const expressRequest = {
      body: undefined,
      workspace: { id: 'workspace-id' },
    } as any;

    const directExecutionService = {
      getWorkspaceResolverNames: jest
        .fn()
        .mockResolvedValue(new Set(['companies'])),
      execute: jest.fn().mockResolvedValue({
        data: { companies: { totalCount: 1 } },
      }),
    } as any;

    const plugin = useDirectExecution({
      directExecutionService,
      featureFlagService: {} as any,
    });

    plugin.onRequest?.({
      request: requestAtOnRequest,
      serverContext: { req: expressRequest } as any,
      fetchAPI: globalThis,
      setRequest: jest.fn(),
      requestHandler: jest.fn() as any,
      setRequestHandler: jest.fn(),
      endResponse: jest.fn(),
      url: new URL(requestAtOnRequest.url),
    });

    const onRequestParseResult = await plugin.onRequestParse?.({
      request: requestAtOnRequest,
      url: new URL(requestAtOnRequest.url),
      requestParser: jest.fn() as any,
      serverContext: { req: expressRequest } as any,
      setRequestParser: jest.fn(),
    });

    await onRequestParseResult?.onRequestParseDone?.({
      requestParserResult: {
        operationName: 'AggregateCompanies',
        query: `query AggregateCompanies($filter: CompanyFilterInput) {
          companies(filter: $filter) {
            totalCount
          }
        }`,
        variables: {
          filter: {
            id: {
              eq: 'company-id',
            },
          },
        },
      },
      setRequestParserResult: jest.fn(),
    });

    const setResult = jest.fn();

    await plugin.onParams?.({
      request: requestAtOnParams,
      params: {
        operationName: 'AggregateCompanies',
        query: `query AggregateCompanies($filter: CompanyFilterInput) {
          companies(filter: $filter) {
            totalCount
          }
        }`,
        variables: {
          filter: {
            id: {
              eq: 'company-id',
            },
          },
        },
      },
      setParams: jest.fn(),
      setResult,
      fetchAPI: globalThis,
    });

    expect(directExecutionService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        req: expressRequest,
        operationName: 'AggregateCompanies',
        variables: {
          filter: {
            id: {
              eq: 'company-id',
            },
          },
        },
      }),
    );
    expect(setResult).toHaveBeenCalledWith({
      data: { companies: { totalCount: 1 } },
    });
  });

  it('should not reuse stale parsed params mappings across requests with identical params', async () => {
    const params = {
      operationName: 'AggregateCompanies',
      query: `query AggregateCompanies($filter: CompanyFilterInput) {
        companies(filter: $filter) {
          totalCount
        }
      }`,
      variables: {
        filter: {
          id: {
            eq: 'company-id',
          },
        },
      },
    };

    const request1 = new Request('http://localhost:3000/graphql', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const request2AtOnRequest = new Request('http://localhost:3000/graphql', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const request2AtOnParams = new Request('http://localhost:3000/graphql', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const expressRequest1 = {
      body: undefined,
      workspace: { id: 'workspace-1' },
    } as const;
    const expressRequest2 = {
      body: undefined,
      workspace: { id: 'workspace-2' },
    } as const;

    const directExecutionService = {
      getWorkspaceResolverNames: jest
        .fn()
        .mockResolvedValue(new Set(['companies'])),
      execute: jest.fn().mockResolvedValue({
        data: { companies: { totalCount: 1 } },
      }),
    } as any;

    const plugin = useDirectExecution({
      directExecutionService,
      featureFlagService: {} as any,
    });

    plugin.onRequest?.({
      request: request1,
      serverContext: { req: expressRequest1 } as any,
      fetchAPI: globalThis,
      setRequest: jest.fn(),
      requestHandler: jest.fn() as any,
      setRequestHandler: jest.fn(),
      endResponse: jest.fn(),
      url: new URL(request1.url),
    });

    const onRequestParseResult1 = await plugin.onRequestParse?.({
      request: request1,
      url: new URL(request1.url),
      requestParser: jest.fn() as any,
      serverContext: { req: expressRequest1 } as any,
      setRequestParser: jest.fn(),
    });

    await onRequestParseResult1?.onRequestParseDone?.({
      requestParserResult: params,
      setRequestParserResult: jest.fn(),
    });

    await plugin.onParams?.({
      request: request1,
      params,
      setParams: jest.fn(),
      setResult: jest.fn(),
      fetchAPI: globalThis,
    });

    plugin.onResponse?.({
      request: request1,
    } as Parameters<NonNullable<typeof plugin.onResponse>>[0]);

    plugin.onRequest?.({
      request: request2AtOnRequest,
      serverContext: { req: expressRequest2 } as any,
      fetchAPI: globalThis,
      setRequest: jest.fn(),
      requestHandler: jest.fn() as any,
      setRequestHandler: jest.fn(),
      endResponse: jest.fn(),
      url: new URL(request2AtOnRequest.url),
    });

    const onRequestParseResult2 = await plugin.onRequestParse?.({
      request: request2AtOnRequest,
      url: new URL(request2AtOnRequest.url),
      requestParser: jest.fn() as any,
      serverContext: { req: expressRequest2 } as any,
      setRequestParser: jest.fn(),
    });

    await onRequestParseResult2?.onRequestParseDone?.({
      requestParserResult: params,
      setRequestParserResult: jest.fn(),
    });

    await plugin.onParams?.({
      request: request2AtOnParams,
      params,
      setParams: jest.fn(),
      setResult: jest.fn(),
      fetchAPI: globalThis,
    });

    expect(directExecutionService.execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        req: expressRequest2,
      }),
    );
  });
});
