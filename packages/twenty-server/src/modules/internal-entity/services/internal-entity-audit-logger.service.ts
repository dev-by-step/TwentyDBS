import { Injectable, Logger } from '@nestjs/common';

export type PermissionDeniedAuditContext = {
  workspaceId: string;
  userId?: string;
  workspaceMemberId?: string;
  objectName?: string;
  recordId?: string;
  reason?: string;
  details?: Record<string, unknown>;
};

export type SourceTaggingBypassAuditContext = {
  workspaceId: string;
  userId?: string;
  workspaceMemberId?: string;
  objectName?: string;
  reason: 'server-context' | 'platform-admin' | 'entity-manager';
};

export type JwtFallbackAuditContext = {
  userId: string;
  tokenWorkspaceId?: string;
  fallbackWorkspaceId: string;
  reason: string;
};

export type InternalEntityMergeAuditContext = {
  workspaceId: string;
  canonicalInternalEntityId: string;
  duplicateInternalEntityIds: string[];
  affectedRecordCounts: Record<string, number>;
};

@Injectable()
export class InternalEntityAuditLoggerService {
  private readonly logger = new Logger(InternalEntityAuditLoggerService.name);

  logPermissionDenied(context: PermissionDeniedAuditContext): void {
    this.logger.warn(
      JSON.stringify({
        event: 'INTERNAL_ENTITY_PERMISSION_DENIED',
        ...context,
      }),
    );
  }

  logSourceTaggingBypass(context: SourceTaggingBypassAuditContext): void {
    this.logger.warn(
      JSON.stringify({
        event: 'INTERNAL_ENTITY_SOURCE_TAGGING_BYPASS',
        ...context,
      }),
    );
  }

  logJwtFallback(context: JwtFallbackAuditContext): void {
    this.logger.warn(
      JSON.stringify({
        event: 'INTERNAL_ENTITY_JWT_FALLBACK',
        ...context,
      }),
    );
  }

  logInternalEntityMerge(context: InternalEntityMergeAuditContext): void {
    this.logger.warn(
      JSON.stringify({
        event: 'INTERNAL_ENTITY_MERGE',
        ...context,
      }),
    );
  }
}
