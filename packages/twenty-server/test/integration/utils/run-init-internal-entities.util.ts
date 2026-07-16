import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const TWENTY_SERVER_ROOT = resolve(__dirname, '../../..');

/**
 * Runs the `init-internal-entities` CLI command against whichever database
 * the current process env points to (NODE_ENV=test -> .env.test).
 *
 * `InitInternalEntitiesCommand` lives in the CLI-only bootstrap context
 * (`DatabaseCommandModule`), not in the HTTP `AppModule` the integration test
 * server boots — so it isn't reachable via `global.app.get(...)`. Shelling
 * out to the compiled CLI entrypoint is the same thing a real operator does
 * (`nx run twenty-server:command -- init-internal-entities`) and sidesteps
 * that DI-graph mismatch entirely.
 */
export const runInitInternalEntities = () => {
  try {
    execFileSync(
      'node',
      ['dist/command/command.js', 'init-internal-entities'],
      {
        cwd: TWENTY_SERVER_ROOT,
        encoding: 'utf-8',
      },
    );
  } catch (error) {
    const combinedOutput = [
      (error as { stdout?: string }).stdout,
      (error as { stderr?: string }).stderr,
    ]
      .filter(Boolean)
      .join('\n');

    // Known, documented limitation (see MEMORY.md "Pièges connus — code"):
    // the local Apple dev seed's random opportunities don't line up with
    // docs/opportunity.csv, so the final unresolved-opportunities check
    // throws. Everything this suite actually needs — the InternalEntity
    // schema, the 4 seeded entities, and the dev users' entity memberships —
    // is already committed by the time that check runs. Any other failure
    // is a real setup problem and must not be swallowed.
    if (!combinedOutput.includes('sans internalEntityId après migration')) {
      throw error;
    }
  }
};
