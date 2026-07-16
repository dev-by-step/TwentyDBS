import { Module } from '@nestjs/common';

import { InternalEntityAuditLoggerService } from 'src/modules/internal-entity/services/internal-entity-audit-logger.service';

@Module({
  providers: [InternalEntityAuditLoggerService],
  exports: [InternalEntityAuditLoggerService],
})
export class InternalEntityAuditLoggerModule {}
