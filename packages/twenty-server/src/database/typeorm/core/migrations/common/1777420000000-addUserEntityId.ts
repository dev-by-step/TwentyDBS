import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddUserEntityId1777420000000 implements MigrationInterface {
  name = 'AddUserEntityId1777420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "core"."user" ADD "entityId" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_USER_ENTITY_ID" ON "core"."user" ("entityId") WHERE "entityId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "core"."IDX_USER_ENTITY_ID"`);
    await queryRunner.query(`ALTER TABLE "core"."user" DROP COLUMN "entityId"`);
  }
}
