import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { type GraphQLFormattedError } from 'graphql';

import {
  getRecoverableDuplicateRecordId,
  isDuplicateRecordError,
} from '@/onboarding/utils/getRecoverableDuplicateRecordId';

const makeCombinedGraphQLErrors = (
  errors: GraphQLFormattedError[],
): CombinedGraphQLErrors => new CombinedGraphQLErrors({ errors, data: null });

const makeDuplicateError = (
  extensions: Record<string, unknown> = {},
): CombinedGraphQLErrors =>
  makeCombinedGraphQLErrors([
    {
      message: 'A duplicate entry was detected',
      extensions: {
        code: 'BAD_USER_INPUT',
        ...extensions,
      },
    },
  ]);

describe('getRecoverableDuplicateRecordId', () => {
  it('returns the conflicting record id for the expected object', () => {
    const error = makeDuplicateError({
      conflictingRecordId: '550e8400-e29b-41d4-a716-446655440001',
      conflictingObjectNameSingular: 'internalEntity',
    });

    expect(getRecoverableDuplicateRecordId(error, 'internalEntity')).toBe(
      '550e8400-e29b-41d4-a716-446655440001',
    );
  });

  it('returns null when the conflict targets another object', () => {
    const error = makeDuplicateError({
      conflictingRecordId: '550e8400-e29b-41d4-a716-446655440001',
      conflictingObjectNameSingular: 'company',
    });

    expect(getRecoverableDuplicateRecordId(error, 'internalEntity')).toBeNull();
  });

  it('returns null when no conflicting record info is attached', () => {
    const error = makeDuplicateError();

    expect(getRecoverableDuplicateRecordId(error, 'internalEntity')).toBeNull();
  });

  it('returns null for non-GraphQL errors', () => {
    expect(
      getRecoverableDuplicateRecordId(
        new Error('network down'),
        'internalEntity',
      ),
    ).toBeNull();
  });
});

describe('isDuplicateRecordError', () => {
  it('detects a duplicate error with conflicting record info', () => {
    const error = makeDuplicateError({
      conflictingRecordId: '550e8400-e29b-41d4-a716-446655440001',
      conflictingObjectNameSingular: 'workspaceMemberEntityMembership',
    });

    expect(isDuplicateRecordError(error)).toBe(true);
  });

  it('detects a duplicate error without conflicting record info (composite unique index)', () => {
    const error = makeDuplicateError();

    expect(isDuplicateRecordError(error)).toBe(true);
  });

  it('rejects other GraphQL errors', () => {
    const error = makeCombinedGraphQLErrors([
      { message: 'Record does not satisfy security constraints.' },
    ]);

    expect(isDuplicateRecordError(error)).toBe(false);
  });

  it('rejects non-GraphQL errors', () => {
    expect(isDuplicateRecordError(new Error('boom'))).toBe(false);
  });
});
