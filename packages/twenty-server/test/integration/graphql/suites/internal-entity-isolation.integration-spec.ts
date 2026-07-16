import { randomUUID } from 'crypto';

import gql from 'graphql-tag';
import { ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { ErrorCode } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { deleteOneOperationFactory } from 'test/integration/graphql/utils/delete-one-operation-factory.util';
import { findManyOperationFactory } from 'test/integration/graphql/utils/find-many-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import {
  assertGraphQLErrorResponse,
  assertGraphQLSuccessfulResponse,
} from 'test/integration/graphql/utils/graphql-test-assertions.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { updateManyOperationFactory } from 'test/integration/graphql/utils/update-many-operation-factory.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { deleteAllRecords } from 'test/integration/utils/delete-all-records';
import { runInitInternalEntities } from 'test/integration/utils/run-init-internal-entities.util';

/**
 * IMP-17 (docs/AUDIT-BACKLOG.md): end-to-end coverage of the internal-entity
 * isolation model — the fork's single most important guarantee — through the
 * real GraphQL pipeline (query hooks + FilterArgProcessorService + the
 * workspace-scoped ORM), not mocks. If this suite ever goes red, cross-entity
 * data leakage or a permission regression is live in the running server, not
 * just in a unit's assumptions.
 *
 * The suite never hardcodes which seeded dev user (Jane/Phil/Jony) owns which
 * internal entity or admin flag: it discovers that from a live `currentUser`
 * query so it stays correct if `PRIMARY_DEV_WORKSPACE_USERS` is reseeded.
 */

const CURRENT_USER_ENTITY_CONTEXT_QUERY = gql`
  query CurrentUserEntityContext {
    currentUser {
      id
      canAccessFullAdminPanel
      entityId
      currentUserWorkspace {
        id
      }
      workspaceMember {
        id
      }
    }
  }
`;

type CurrentUserEntityContext = {
  id: string;
  canAccessFullAdminPanel: boolean;
  entityId: string | null;
  workspaceMember: { id: string } | null;
};

const getUserEntityContext = async (
  token: string,
): Promise<CurrentUserEntityContext> => {
  const response = await makeMetadataAPIRequest(
    { query: CURRENT_USER_ENTITY_CONTEXT_QUERY },
    token,
  );

  expect(response.body.errors).toBeUndefined();

  return response.body.data.currentUser;
};

const CREATE_ISOLATION_TEST_ROLE_MUTATION = gql`
  mutation CreateIsolationTestRole($createRoleInput: CreateRoleInput!) {
    createOneRole(createRoleInput: $createRoleInput) {
      id
      label
    }
  }
`;

const ASSIGN_WORKSPACE_MEMBER_ROLE_MUTATION = gql`
  mutation AssignIsolationTestRole($workspaceMemberId: UUID!, $roleId: UUID!) {
    updateWorkspaceMemberRole(
      workspaceMemberId: $workspaceMemberId
      roleId: $roleId
    ) {
      id
    }
  }
`;

// The seeded dev Member/EntityManager roles default to
// canUpdateAllObjectRecords: false (see docs/AUDIT-BACKLOG.md FIX-26): every
// non-admin dev user is denied create/update/delete on every object out of
// the box, and those two roles are non-editable system roles (upserting
// object permissions on them fails with ROLE_NOT_EDITABLE). That base RBAC
// gate is orthogonal to the fork's entity-isolation layer this suite exists
// to verify, so we create a dedicated custom role with blanket read/write
// access and additively assign it (`updateWorkspaceMemberRole` calls the
// same additive `assignRoleToManyUserWorkspace` the dev seeder itself uses,
// so it does not revoke Member/EntityManager) to our two non-admin reference
// users. This keeps entity-scoping the only variable under test for every
// write-isolation assertion below. The role is deliberately NOT labelled
// "Entity Manager" so it doesn't accidentally satisfy the fork's own
// `isEntityManager` check and bypass the very thing we're testing.
const ISOLATION_TEST_ROLE_LABEL = 'Isolation Test Full Access';

const GET_ROLES_BY_LABEL_QUERY = gql`
  query GetRolesByLabelForIsolationSetup {
    getRoles {
      id
      label
    }
  }
`;

// Idempotent: the role is deliberately never cleaned up between runs (roles
// aren't scoped per-test-run in this shared dev workspace), so re-running the
// suite must reuse the existing role instead of failing on a duplicate label.
const grantFullObjectAccessRole = async ({
  privilegedToken,
  workspaceMemberIds,
}: {
  privilegedToken: string;
  workspaceMemberIds: string[];
}) => {
  const existingRolesResponse = await makeMetadataAPIRequest(
    { query: GET_ROLES_BY_LABEL_QUERY },
    privilegedToken,
  );

  expect(existingRolesResponse.body.errors).toBeUndefined();

  const existingRole = (
    existingRolesResponse.body.data.getRoles as Array<{
      id: string;
      label: string;
    }>
  ).find((role) => role.label === ISOLATION_TEST_ROLE_LABEL);

  let roleId: string;

  if (isDefined(existingRole)) {
    roleId = existingRole.id;
  } else {
    const createRoleResponse = await makeMetadataAPIRequest(
      {
        query: CREATE_ISOLATION_TEST_ROLE_MUTATION,
        variables: {
          createRoleInput: {
            label: ISOLATION_TEST_ROLE_LABEL,
            description:
              'Blanket CRUD role granted to non-admin reference users for internal-entity-isolation.integration-spec.ts',
            canUpdateAllSettings: false,
            canReadAllObjectRecords: true,
            canUpdateAllObjectRecords: true,
            canSoftDeleteAllObjectRecords: true,
            canDestroyAllObjectRecords: true,
          },
        },
      },
      privilegedToken,
    );

    expect(createRoleResponse.body.errors).toBeUndefined();

    roleId = createRoleResponse.body.data.createOneRole.id as string;
  }

  for (const workspaceMemberId of workspaceMemberIds) {
    const assignResponse = await makeMetadataAPIRequest(
      {
        query: ASSIGN_WORKSPACE_MEMBER_ROLE_MUTATION,
        variables: { workspaceMemberId, roleId },
      },
      privilegedToken,
    );

    expect(assignResponse.body.errors).toBeUndefined();
  }
};

const OPPORTUNITY_GQL_FIELDS = `
  id
  name
  internalEntityId
`;

const COMPANY_GQL_FIELDS = `
  id
  name
  internalEntities {
    edges {
      node {
        id
        internalEntityId
      }
    }
  }
`;

describe('internal entity isolation (integration)', () => {
  // Two non-admin dev users belonging to two different (single) internal
  // entities, discovered dynamically in beforeAll.
  let entityAToken: string;
  let entityBToken: string;
  let entityAId: string;
  let entityBId: string;

  // A third dev user with cross-entity write privileges (platform admin or
  // entity manager), also discovered dynamically.
  let privilegedToken: string;

  let entityAOpportunityId: string;
  let entityBOpportunityId: string;

  beforeAll(async () => {
    // 1. Ensure the InternalEntity metadata, the 4 seeded entities, and the
    //    dev users' entity memberships exist. Idempotent: safe to run even
    //    if a previous test run already initialised this workspace.
    runInitInternalEntities();

    // 2. Discover, from the live API, two dev users on different entities
    //    and one privileged (cross-entity) user among our three reference
    //    tokens.
    const [jane, phil, jony] = await Promise.all([
      getUserEntityContext(APPLE_JANE_ADMIN_ACCESS_TOKEN),
      getUserEntityContext(APPLE_PHIL_GUEST_ACCESS_TOKEN),
      getUserEntityContext(APPLE_JONY_MEMBER_ACCESS_TOKEN),
    ]);

    expect(jane.entityId).toBeDefined();
    expect(phil.entityId).toBeDefined();
    expect(jane.entityId).not.toEqual(phil.entityId);

    entityAToken = APPLE_JANE_ADMIN_ACCESS_TOKEN;
    entityBToken = APPLE_PHIL_GUEST_ACCESS_TOKEN;
    entityAId = jane.entityId as string;
    entityBId = phil.entityId as string;

    const privilegedUser = [jane, phil, jony].find(
      (user) => user.canAccessFullAdminPanel,
    );

    expect(privilegedUser).toBeDefined();

    privilegedToken =
      privilegedUser === jane
        ? APPLE_JANE_ADMIN_ACCESS_TOKEN
        : privilegedUser === phil
          ? APPLE_PHIL_GUEST_ACCESS_TOKEN
          : APPLE_JONY_MEMBER_ACCESS_TOKEN;

    // 3. Grant our two non-admin reference users base RBAC write access on
    //    opportunity/company so entity-scoping is the only gate left to
    //    exercise below (see FIX-26 in docs/AUDIT-BACKLOG.md).
    expect(jane.workspaceMember).toBeDefined();
    expect(phil.workspaceMember).toBeDefined();

    await grantFullObjectAccessRole({
      privilegedToken,
      workspaceMemberIds: [
        (jane.workspaceMember as { id: string }).id,
        (phil.workspaceMember as { id: string }).id,
      ],
    });

    // 4. This suite owns opportunity/company end-to-end: start from a clean
    //    slate (same convention as the other integration suites).
    await deleteAllRecords('opportunity');
    await deleteAllRecords('company');
  }, 60000);

  describe('source tagging on create', () => {
    it('auto-tags an opportunity created by an entity A user with entity A', async () => {
      const response = await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'opportunity',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
          data: {
            id: randomUUID(),
            name: 'Entity A opportunity',
            stage: 'NEW',
          },
        }),
        entityAToken,
      );

      assertGraphQLSuccessfulResponse(response);
      expect(response.body.data.createOpportunity.internalEntityId).toEqual(
        entityAId,
      );

      entityAOpportunityId = response.body.data.createOpportunity.id;
    });

    it('auto-tags an opportunity created by an entity B user with entity B', async () => {
      const response = await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'opportunity',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
          data: {
            id: randomUUID(),
            name: 'Entity B opportunity',
            stage: 'NEW',
          },
        }),
        entityBToken,
      );

      assertGraphQLSuccessfulResponse(response);
      expect(response.body.data.createOpportunity.internalEntityId).toEqual(
        entityBId,
      );

      entityBOpportunityId = response.body.data.createOpportunity.id;
    });

    it('rejects an opportunity explicitly assigned to another entity (FIX-04 regression)', async () => {
      const response = await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'opportunity',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
          data: {
            id: randomUUID(),
            name: 'Cross-entity assignment attempt',
            stage: 'NEW',
            internalEntityId: entityAId,
          },
        }),
        entityBToken,
      );

      assertGraphQLErrorResponse(response, ErrorCode.FORBIDDEN);
    });

    it('tags with the header-requested entity, not the caller default, when the caller belongs to both', async () => {
      const response = await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'opportunity',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
          data: {
            id: randomUUID(),
            name: 'Header override on create',
            stage: 'NEW',
          },
        }),
        privilegedToken,
        { [ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME]: entityBId },
      );

      assertGraphQLSuccessfulResponse(response);
      expect(response.body.data.createOpportunity.internalEntityId).toEqual(
        entityBId,
      );
    });
  });

  describe('read isolation', () => {
    it('excludes entity B opportunities when entity A user reads scoped to entity A', async () => {
      const response = await makeGraphqlAPIRequest(
        findManyOperationFactory({
          objectMetadataSingularName: 'opportunity',
          objectMetadataPluralName: 'opportunities',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
        }),
        entityAToken,
        { [ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME]: entityAId },
      );

      const ids = response.body.data.opportunities.edges.map(
        (edge: { node: { id: string } }) => edge.node.id,
      );

      expect(ids).toContain(entityAOpportunityId);
      expect(ids).not.toContain(entityBOpportunityId);
    });

    it('excludes entity A opportunities when entity B user reads scoped to entity B', async () => {
      const response = await makeGraphqlAPIRequest(
        findManyOperationFactory({
          objectMetadataSingularName: 'opportunity',
          objectMetadataPluralName: 'opportunities',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
        }),
        entityBToken,
        { [ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME]: entityBId },
      );

      const ids = response.body.data.opportunities.edges.map(
        (edge: { node: { id: string } }) => edge.node.id,
      );

      expect(ids).toContain(entityBOpportunityId);
      expect(ids).not.toContain(entityAOpportunityId);
    });

    it('treats a record outside the requested entity scope as not found via findOne', async () => {
      const response = await makeGraphqlAPIRequest(
        findOneOperationFactory({
          objectMetadataSingularName: 'opportunity',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
          filter: { id: { eq: entityAOpportunityId } },
        }),
        entityBToken,
        { [ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME]: entityBId },
      );

      // Twenty's findOne throws RECORD_NOT_FOUND once the scope filter
      // excludes the record — same response shape as a genuinely missing id,
      // which is exactly what entity scoping should produce here.
      assertGraphQLErrorResponse(response, ErrorCode.NOT_FOUND);
    });

    it('returns opportunities from every entity in group view (no active entity header)', async () => {
      const response = await makeGraphqlAPIRequest(
        findManyOperationFactory({
          objectMetadataSingularName: 'opportunity',
          objectMetadataPluralName: 'opportunities',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
        }),
        entityAToken,
      );

      const ids = response.body.data.opportunities.edges.map(
        (edge: { node: { id: string } }) => edge.node.id,
      );

      expect(ids).toContain(entityAOpportunityId);
      expect(ids).toContain(entityBOpportunityId);
    });
  });

  describe('write isolation', () => {
    it('denies updating an opportunity that belongs to another entity', async () => {
      const response = await makeGraphqlAPIRequest(
        updateOneOperationFactory({
          objectMetadataSingularName: 'opportunity',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
          recordId: entityAOpportunityId,
          data: { name: 'Hijacked by entity B' },
        }),
        entityBToken,
      );

      assertGraphQLErrorResponse(response, ErrorCode.FORBIDDEN);
    });

    it('denies deleting an opportunity that belongs to another entity', async () => {
      const response = await makeGraphqlAPIRequest(
        deleteOneOperationFactory({
          objectMetadataSingularName: 'opportunity',
          gqlFields: 'id',
          recordId: entityAOpportunityId,
        }),
        entityBToken,
      );

      assertGraphQLErrorResponse(response, ErrorCode.FORBIDDEN);
    });

    it('denies a bulk update over entity-scoped opportunities for a non-privileged user', async () => {
      const response = await makeGraphqlAPIRequest(
        updateManyOperationFactory({
          objectMetadataSingularName: 'opportunity',
          objectMetadataPluralName: 'opportunities',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
          filter: { id: { eq: entityAOpportunityId } },
          data: { name: 'Bulk hijack attempt' },
        }),
        entityBToken,
      );

      assertGraphQLErrorResponse(response, ErrorCode.FORBIDDEN);
    });
  });

  describe('privileged cross-entity write access', () => {
    it('allows the privileged user to update an opportunity in an entity they do not belong to', async () => {
      const response = await makeGraphqlAPIRequest(
        updateOneOperationFactory({
          objectMetadataSingularName: 'opportunity',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
          recordId: entityAOpportunityId,
          data: { name: 'Updated by privileged user' },
        }),
        privilegedToken,
      );

      assertGraphQLSuccessfulResponse(response);
      expect(response.body.data.updateOpportunity.name).toEqual(
        'Updated by privileged user',
      );
    });

    it('still scopes the privileged user reads to the entity requested via the header', async () => {
      const response = await makeGraphqlAPIRequest(
        findManyOperationFactory({
          objectMetadataSingularName: 'opportunity',
          objectMetadataPluralName: 'opportunities',
          gqlFields: OPPORTUNITY_GQL_FIELDS,
        }),
        privilegedToken,
        { [ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME]: entityBId },
      );

      const ids = response.body.data.opportunities.edges.map(
        (edge: { node: { id: string } }) => edge.node.id,
      );

      expect(ids).toContain(entityBOpportunityId);
      expect(ids).not.toContain(entityAOpportunityId);
    });
  });

  describe('company multi-entity (M2M junction) isolation', () => {
    let entityACompanyId: string;
    let entityBCompanyId: string;

    // The membership junction row is inserted by a POST-query hook that runs
    // after the create mutation's own response fields are already resolved,
    // so `internalEntities` is never populated in the create response itself
    // — the membership must be verified via a follow-up read instead.
    it('auto-tags a company created by an entity A user via the membership junction', async () => {
      const createResponse = await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'company',
          gqlFields: 'id',
          data: { id: randomUUID(), name: 'Entity A company' },
        }),
        entityAToken,
      );

      assertGraphQLSuccessfulResponse(createResponse);
      entityACompanyId = createResponse.body.data.createCompany.id;

      const readResponse = await makeGraphqlAPIRequest(
        findOneOperationFactory({
          objectMetadataSingularName: 'company',
          gqlFields: COMPANY_GQL_FIELDS,
          filter: { id: { eq: entityACompanyId } },
        }),
        entityAToken,
      );

      const memberships = readResponse.body.data.company.internalEntities.edges;

      expect(memberships).toHaveLength(1);
      expect(memberships[0].node.internalEntityId).toEqual(entityAId);
    });

    it('auto-tags a company created by an entity B user via the membership junction', async () => {
      const createResponse = await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'company',
          gqlFields: 'id',
          data: { id: randomUUID(), name: 'Entity B company' },
        }),
        entityBToken,
      );

      assertGraphQLSuccessfulResponse(createResponse);
      entityBCompanyId = createResponse.body.data.createCompany.id;

      const readResponse = await makeGraphqlAPIRequest(
        findOneOperationFactory({
          objectMetadataSingularName: 'company',
          gqlFields: COMPANY_GQL_FIELDS,
          filter: { id: { eq: entityBCompanyId } },
        }),
        entityBToken,
      );

      const memberships = readResponse.body.data.company.internalEntities.edges;

      expect(memberships).toHaveLength(1);
      expect(memberships[0].node.internalEntityId).toEqual(entityBId);
    });

    it('excludes the entity B company when entity A user reads scoped to entity A', async () => {
      const response = await makeGraphqlAPIRequest(
        findManyOperationFactory({
          objectMetadataSingularName: 'company',
          objectMetadataPluralName: 'companies',
          gqlFields: COMPANY_GQL_FIELDS,
        }),
        entityAToken,
        { [ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME]: entityAId },
      );

      const ids = response.body.data.companies.edges.map(
        (edge: { node: { id: string } }) => edge.node.id,
      );

      expect(ids).toContain(entityACompanyId);
      expect(ids).not.toContain(entityBCompanyId);
    });
  });
});
