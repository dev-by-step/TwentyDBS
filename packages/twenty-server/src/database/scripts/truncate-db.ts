import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';

import { performQuery } from './setup-db-utils';

async function dropSchemasSequentially() {
  try {
    await rawDataSource.initialize();

    // Fetch all schemas excluding the ones we want to keep
    const schemas =
      (await performQuery<{ schema_name: string }[]>(
        `
      SELECT n.nspname AS "schema_name"
      FROM pg_catalog.pg_namespace n
      WHERE n.nspname !~ '^pg_'
        AND n.nspname <> 'information_schema'
        AND n.nspname NOT IN ('metric_helpers', 'user_management', 'public')
    `,
        'Fetching schemas...',
      )) ?? [];

    const batchSize = 10;

    for (let i = 0; i < schemas.length; i += batchSize) {
      const batch = schemas.slice(i, i + batchSize);

      await Promise.all(
        batch.map((schema) =>
          performQuery(
            `DROP SCHEMA IF EXISTS "${schema.schema_name}" CASCADE;`,
            `Dropping schema ${schema.schema_name}...`,
          ),
        ),
      );
    }
    // oxlint-disable-next-line no-console
    console.log('All schemas dropped successfully.');

    // Reset activation status so workspace init re-triggers on next login
    await performQuery(
      `UPDATE public.workspace
       SET "activationStatus" = 'PENDING_CREATION'
       WHERE "activationStatus" != 'PENDING_CREATION'`,
      'Resetting workspace activation status...',
    );

    // Reset onboarding status so user sees setup screens again
    await performQuery(
      `UPDATE public."user"
       SET "onboardingStatus" = 'WORKSPACE_ACTIVATION'
       WHERE "onboardingStatus" IS DISTINCT FROM 'WORKSPACE_ACTIVATION'`,
      'Resetting user onboarding status...',
    );

    // oxlint-disable-next-line no-console
    console.log('Workspace and user states reset for re-onboarding.');
  } catch (err) {
    // oxlint-disable-next-line no-console
    console.error('Error during schema dropping:', err);
  }
}

dropSchemasSequentially();
