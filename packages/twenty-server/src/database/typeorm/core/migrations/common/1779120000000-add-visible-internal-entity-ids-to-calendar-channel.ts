import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddVisibleInternalEntityIdsToCalendarChannel1779120000000
  implements MigrationInterface
{
  name = 'AddVisibleInternalEntityIdsToCalendarChannel1779120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."calendarChannel" ADD "visibleInternalEntityIds" uuid array NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."calendarChannel" DROP COLUMN "visibleInternalEntityIds"`,
    );
  }
}
