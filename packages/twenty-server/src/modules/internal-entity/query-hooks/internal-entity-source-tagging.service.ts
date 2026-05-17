import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

import {
  type CreateManyResolverArgs,
  type CreateOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { GlobalWorkspaceDataSourceService } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.service';
import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  buildWorkspaceSqlTableName,
  validateUuidOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-command.utils';
import {
  INTERNAL_ENTITY_OBJECT_NAME,
  INTERNAL_ENTITY_SOURCE_TAGGING_QUERY_OPTIONS,
  OPPORTUNITY_OBJECT_NAME,
} from 'src/modules/internal-entity/query-hooks/constants/internal-entity-source-tagging.constants';
import { type InternalEntitySourceTaggableRecordInput } from 'src/modules/internal-entity/query-hooks/types/internal-entity-source-tagging.type';
import {
  buildMembershipInsertBatch,
  buildMembershipInsertQuery,
} from 'src/modules/internal-entity/query-hooks/utils/internal-entity-source-tagging-sql.util';
import {
  getInternalEntityMembershipConfig,
  isInternalEntitySourceTargetObjectName,
} from 'src/modules/internal-entity/query-hooks/utils/internal-entity-source-tagging.util';
import { WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

@Injectable()
export class InternalEntitySourceTaggingService {
  constructor(
    private readonly globalWorkspaceDataSourceService: GlobalWorkspaceDataSourceService,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly workspaceMemberInternalEntityService: WorkspaceMemberInternalEntityService,
  ) {}

  async tagCreateOnePayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateOneResolverArgs<InternalEntitySourceTaggableRecordInput>,
  ): Promise<CreateOneResolverArgs<InternalEntitySourceTaggableRecordInput>> {
    if (!isInternalEntitySourceTargetObjectName(objectName)) {
      return payload;
    }

    this.assertPayloadDataIsDefined(payload.data);

    const internalEntityId =
      await this.resolveAndValidateUserInternalEntityId(authContext);

    if (objectName !== OPPORTUNITY_OBJECT_NAME) {
      return payload;
    }

    return {
      ...payload,
      data: {
        ...payload.data,
        internalEntityId,
      },
    };
  }

  async tagCreateManyPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateManyResolverArgs<InternalEntitySourceTaggableRecordInput>,
  ): Promise<CreateManyResolverArgs<InternalEntitySourceTaggableRecordInput>> {
    if (!isInternalEntitySourceTargetObjectName(objectName)) {
      return payload;
    }

    if (!isDefined(payload.data)) {
      throw new CommonQueryRunnerException(
        'Payload data is required',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: msg`Payload data is required.` },
      );
    }

    const internalEntityId =
      await this.resolveAndValidateUserInternalEntityId(authContext);

    if (objectName !== OPPORTUNITY_OBJECT_NAME) {
      return payload;
    }

    return {
      ...payload,
      data: payload.data.map((record) => ({
        ...record,
        internalEntityId,
      })),
    };
  }

  async createMembershipsForRecords({
    authContext,
    objectName,
    records,
  }: {
    authContext: WorkspaceAuthContext;
    objectName: string;
    records: ObjectRecord[];
  }): Promise<void> {
    const membershipConfig = getInternalEntityMembershipConfig(objectName);

    if (!isDefined(membershipConfig) || records.length === 0) {
      return;
    }

    const internalEntityId =
      await this.getUserInternalEntityIdOrThrow(authContext);
    const recordIds = this.extractCreatedRecordIds(records);

    if (recordIds.length === 0) {
      return;
    }

    const workspaceId = validateUuidOrThrow(
      authContext.workspace.id,
      'workspaceId',
    );
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const membershipTableName = await this.resolveWorkspaceObjectTableName({
      workspaceId,
      objectName: membershipConfig.membershipObjectName,
    });
    const membershipSqlTable = buildWorkspaceSqlTableName(
      schemaName,
      membershipTableName,
    );
    const { valuesSql, values } = buildMembershipInsertBatch({
      recordIds,
      internalEntityId,
    });
    const membershipInsertQuery = buildMembershipInsertQuery({
      membershipSqlTable,
      sourceJoinColumnName: membershipConfig.sourceJoinColumnName,
      valuesSql,
      values,
    });
    const dataSource =
      this.globalWorkspaceDataSourceService.getGlobalWorkspaceDataSource();

    await dataSource.query(
      membershipInsertQuery.text,
      membershipInsertQuery.values,
      undefined,
      INTERNAL_ENTITY_SOURCE_TAGGING_QUERY_OPTIONS,
    );
  }

  private assertPayloadDataIsDefined(
    payloadData: InternalEntitySourceTaggableRecordInput | undefined,
  ): asserts payloadData is InternalEntitySourceTaggableRecordInput {
    if (!isDefined(payloadData)) {
      throw new CommonQueryRunnerException(
        'Payload data is required',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: msg`Payload data is required.` },
      );
    }
  }

  private async resolveAndValidateUserInternalEntityId(
    authContext: WorkspaceAuthContext,
  ): Promise<string> {
    const internalEntityId =
      await this.getUserInternalEntityIdOrThrow(authContext);
    const workspaceId = validateUuidOrThrow(
      authContext.workspace.id,
      'workspaceId',
    );
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const internalEntityTableName = await this.resolveWorkspaceObjectTableName({
      workspaceId,
      objectName: INTERNAL_ENTITY_OBJECT_NAME,
    });
    const internalEntitySqlTable = buildWorkspaceSqlTableName(
      schemaName,
      internalEntityTableName,
    );
    const dataSource =
      this.globalWorkspaceDataSourceService.getGlobalWorkspaceDataSource();
    const existingInternalEntities = await dataSource.query<
      Array<{ id: string }>
    >(
      `SELECT "id"
       FROM ${internalEntitySqlTable}
       WHERE "id" = $1
         AND "deletedAt" IS NULL
       LIMIT 1`,
      [internalEntityId],
      undefined,
      INTERNAL_ENTITY_SOURCE_TAGGING_QUERY_OPTIONS,
    );

    if (existingInternalEntities.length === 0) {
      throw new CommonQueryRunnerException(
        `User entityId does not match an InternalEntity in workspace ${workspaceId}`,
        CommonQueryRunnerExceptionCode.INVALID_AUTH_CONTEXT,
        {
          userFriendlyMessage: msg`The internal entity assigned to your profile does not exist in this workspace.`,
        },
      );
    }

    return internalEntityId;
  }

  private async getUserInternalEntityIdOrThrow(
    authContext: WorkspaceAuthContext,
  ): Promise<string> {
    if (!isUserAuthContext(authContext)) {
      throw new CommonQueryRunnerException(
        'User authentication is required to tag records with an internal entity',
        CommonQueryRunnerExceptionCode.INVALID_AUTH_CONTEXT,
        {
          userFriendlyMessage: msg`You must be authenticated as a user to create records tagged with an internal entity.`,
        },
      );
    }

    const { activeEntityId: internalEntityId } =
      await this.workspaceMemberInternalEntityService.resolveContext({
        workspaceId: authContext.workspace.id,
        workspaceMemberId: authContext.workspaceMemberId,
        fallbackEntityId: authContext.user.entityId,
        requestedActiveEntityId: authContext.activeInternalEntityId,
      });

    if (!isDefined(internalEntityId) || internalEntityId.length === 0) {
      throw new CommonQueryRunnerException(
        'An active internal entity is required to tag records with an internal entity',
        CommonQueryRunnerExceptionCode.INVALID_AUTH_CONTEXT,
        {
          userFriendlyMessage: msg`Your profile is missing an active internal entity. Ask an administrator to assign one before creating records.`,
        },
      );
    }

    if (!isValidUuid(internalEntityId)) {
      throw new CommonQueryRunnerException(
        `User entityId is not a valid UUID: ${internalEntityId}`,
        CommonQueryRunnerExceptionCode.INVALID_AUTH_CONTEXT,
        {
          userFriendlyMessage: msg`The internal entity assigned to your profile is invalid.`,
        },
      );
    }

    return internalEntityId.toLowerCase();
  }

  private async resolveWorkspaceObjectTableName({
    workspaceId,
    objectName,
  }: {
    workspaceId: string;
    objectName: string;
  }): Promise<string> {
    const objectMetadata =
      await this.objectMetadataService.findOneWithinWorkspace(workspaceId, {
        where: { nameSingular: objectName },
      });

    if (!isDefined(objectMetadata)) {
      throw new CommonQueryRunnerException(
        `Internal entity metadata is missing for object ${objectName}`,
        CommonQueryRunnerExceptionCode.BAD_REQUEST,
        {
          userFriendlyMessage: msg`Internal entity configuration is missing. Ask an administrator to initialize it.`,
        },
      );
    }

    return computeObjectTargetTable({
      nameSingular: objectMetadata.nameSingular,
      isCustom: objectMetadata.isCustom,
    });
  }

  private extractCreatedRecordIds(records: ObjectRecord[]): string[] {
    const recordIds = records.map((record) => record.id);

    if (recordIds.some((recordId) => !isValidUuid(recordId))) {
      throw new CommonQueryRunnerException(
        'Created record id is missing or invalid',
        CommonQueryRunnerExceptionCode.INTERNAL_SERVER_ERROR,
        {
          userFriendlyMessage: msg`Created record is missing a valid id.`,
        },
      );
    }

    return [...new Set(recordIds)];
  }
}
