import * as Sentry from '@sentry/node';
import crypto from 'crypto';
import { type Request as ExpressRequest } from 'express';
import { DocumentNode, GraphQLError, parse } from 'graphql';
import { type Plugin } from 'graphql-yoga';

import { isNull } from '@sniptt/guards';
import { type DirectExecutionService } from 'src/engine/api/graphql/direct-execution/direct-execution.service';
import { classifyTopLevelFields } from 'src/engine/api/graphql/direct-execution/utils/classify-top-level-fields.util';
import { findOperationDefinition } from 'src/engine/api/graphql/direct-execution/utils/find-operation-definition.util';
import { isSubscriptionOperation } from 'src/engine/api/graphql/direct-execution/utils/is-subscription-operation.util';
import { type FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

export type DirectExecutionPluginConfig = {
  directExecutionService: DirectExecutionService;
  featureFlagService: FeatureFlagService;
};

type ParsedExecutionParams = {
  operationName?: string | null;
  query?: string | null;
  variables?: unknown;
};

const expressRequestByYogaRequest = new WeakMap<Request, ExpressRequest>();
const requestStateById = new Map<
  string,
  {
    req: ExpressRequest;
    pendingFingerprints: string[];
  }
>();
const expressRequestsByParamsFingerprint = new Map<string, ExpressRequest[]>();
const DIRECT_EXECUTION_REQUEST_ID_HEADER =
  'x-twenty-direct-execution-request-id';

const getRequestHeader = (request: Request, headerName: string) =>
  request.headers.get(headerName) ?? '';

const getDirectExecutionRequestId = (request: Request) =>
  getRequestHeader(request, DIRECT_EXECUTION_REQUEST_ID_HEADER);

const normalizeValueForFingerprint = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeValueForFingerprint);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [
          key,
          normalizeValueForFingerprint(nestedValue),
        ]),
    );
  }

  return value;
};

const getParamsFingerprint = ({
  request,
  params,
}: {
  request: Request;
  params: ParsedExecutionParams;
}) =>
  JSON.stringify({
    operationName: params.operationName ?? null,
    query: params.query ?? null,
    variables: normalizeValueForFingerprint(params.variables ?? null),
    authorization: getRequestHeader(request, 'authorization'),
    cookie: getRequestHeader(request, 'cookie'),
    schemaVersion: getRequestHeader(request, 'x-schema-version'),
    activeInternalEntityId: getRequestHeader(
      request,
      'x-active-internal-entity-id',
    ),
  });

const registerRequestState = ({
  request,
  req,
}: {
  request: Request;
  req: ExpressRequest;
}) => {
  const requestId = getDirectExecutionRequestId(request);

  requestStateById.set(requestId, {
    req,
    pendingFingerprints: [],
  });
};

const registerExpressRequestForParams = ({
  request,
  req,
  params,
}: {
  request: Request;
  req: ExpressRequest;
  params: ParsedExecutionParams;
}) => {
  const fingerprint = getParamsFingerprint({ request, params });
  const pendingRequests =
    expressRequestsByParamsFingerprint.get(fingerprint) ?? [];
  const requestState = requestStateById.get(
    getDirectExecutionRequestId(request),
  );

  pendingRequests.push(req);
  expressRequestsByParamsFingerprint.set(fingerprint, pendingRequests);
  requestState?.pendingFingerprints.push(fingerprint);
};

const consumeExpressRequestForParams = ({
  request,
  params,
}: {
  request: Request;
  params: ParsedExecutionParams;
}) => {
  const fingerprint = getParamsFingerprint({ request, params });
  const pendingRequests = expressRequestsByParamsFingerprint.get(fingerprint);

  if (!pendingRequests || pendingRequests.length === 0) {
    return;
  }

  const req = pendingRequests.shift();

  if (pendingRequests.length === 0) {
    expressRequestsByParamsFingerprint.delete(fingerprint);
  } else {
    expressRequestsByParamsFingerprint.set(fingerprint, pendingRequests);
  }

  return req;
};

const cleanupPendingFingerprints = ({
  pendingFingerprints,
  req,
}: {
  pendingFingerprints: string[];
  req: ExpressRequest;
}) => {
  for (const fingerprint of pendingFingerprints) {
    const pendingRequests = expressRequestsByParamsFingerprint.get(fingerprint);

    if (!pendingRequests || pendingRequests.length === 0) {
      continue;
    }

    const requestIndex = pendingRequests.findIndex(
      (pendingRequest) => pendingRequest === req,
    );

    if (requestIndex === -1) {
      continue;
    }

    pendingRequests.splice(requestIndex, 1);

    if (pendingRequests.length === 0) {
      expressRequestsByParamsFingerprint.delete(fingerprint);
    } else {
      expressRequestsByParamsFingerprint.set(fingerprint, pendingRequests);
    }
  }
};

export function useDirectExecution(
  config: DirectExecutionPluginConfig,
): Plugin {
  return {
    onRequest: ({ request, serverContext }) => {
      const req = (serverContext as unknown as { req?: ExpressRequest }).req;

      if (!req) {
        return;
      }

      const requestId =
        getDirectExecutionRequestId(request) || crypto.randomUUID();

      request.headers.set(DIRECT_EXECUTION_REQUEST_ID_HEADER, requestId);
      expressRequestByYogaRequest.set(request, req);
      registerRequestState({ request, req });
    },
    onRequestParse: ({ request, serverContext }) => {
      const req = (serverContext as unknown as { req?: ExpressRequest }).req;

      if (!req) {
        return;
      }

      return {
        onRequestParseDone: ({ requestParserResult }) => {
          const parsedParams = Array.isArray(requestParserResult)
            ? requestParserResult
            : [requestParserResult];

          for (const params of parsedParams) {
            registerExpressRequestForParams({
              request,
              req,
              params,
            });
          }
        },
      };
    },
    onResponse: ({ request }) => {
      const requestId = getDirectExecutionRequestId(request);
      const requestState = requestStateById.get(requestId);

      if (requestId.length === 0 || !requestState) {
        return;
      }

      cleanupPendingFingerprints(requestState);
      requestStateById.delete(requestId);
    },
    onParams: async ({ params, request, setResult }) => {
      const req =
        consumeExpressRequestForParams({ request, params }) ??
        expressRequestByYogaRequest.get(request) ??
        requestStateById.get(getDirectExecutionRequestId(request))?.req;

      if (!req?.workspace?.id || typeof params.query !== 'string') {
        return;
      }

      const queryString = params.query;
      const operationName = params.operationName;

      let document: DocumentNode;
      try {
        document = parse(queryString);
      } catch {
        return;
      }

      const operationDefinition = findOperationDefinition(
        document,
        operationName,
      );

      if (
        !operationDefinition ||
        isSubscriptionOperation(document, operationName)
      ) {
        return;
      }

      const workspaceResolverNames =
        await config.directExecutionService.getWorkspaceResolverNames(
          req.workspace.id,
        );

      if (!workspaceResolverNames) {
        return;
      }

      const { hasIntrospectionFields, hasWorkspaceFields, hasCoreFields } =
        classifyTopLevelFields(document, operationName, workspaceResolverNames);

      if (hasCoreFields && hasWorkspaceFields) {
        const error = new UserInputError(
          'This query cannot be executed as a single request. Please split it into separate queries.',
        );

        setResult({ errors: [error] });

        return;
      }

      if (hasCoreFields) {
        return;
      }

      if (Sentry.isInitialized()) {
        const transactionName =
          operationName || operationDefinition.name?.value || '';

        Sentry.setTags({
          operationName: transactionName,
          operation: operationDefinition.operation,
        });
        Sentry.getCurrentScope().setTransactionName(transactionName);
      }

      const result = await config.directExecutionService.execute({
        req,
        document,
        operationName,
        variables:
          (params.variables as Record<string, unknown> | undefined) ?? {},
        hasIntrospectionFields,
        hasWorkspaceFields,
      });

      if (isNull(result)) {
        return;
      }

      setResult({
        ...result,
        errors: result.errors?.map(
          (error) =>
            new GraphQLError(error.message, {
              path: error.path,
              extensions: error.extensions,
            }),
        ),
      });
    },
  };
}
