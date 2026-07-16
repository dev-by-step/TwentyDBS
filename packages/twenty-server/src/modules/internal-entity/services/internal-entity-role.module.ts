import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';
import { InternalEntityRoleService } from 'src/modules/internal-entity/services/internal-entity-role.service';

@Module({
  imports: [UserRoleModule, TypeOrmModule.forFeature([UserEntity])],
  providers: [InternalEntityRoleService],
  exports: [InternalEntityRoleService],
})
export class InternalEntityRoleModule {}
