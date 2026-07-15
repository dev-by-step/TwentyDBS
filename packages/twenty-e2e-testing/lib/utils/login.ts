import { type Page } from '@playwright/test';

import { LoginPage } from '../pom/loginPage';

const DEFAULT_WORKSPACE_NAME = 'Apple';

const getRequiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required E2E environment variable: ${name}`);
  }

  return value;
};

const isVisible = async (locator: ReturnType<Page['getByRole']>) =>
  locator.isVisible().catch(() => false);

export const loginWithDefaultUserAndSelectWorkspace = async ({
  loginPage,
  page,
  workspaceName = DEFAULT_WORKSPACE_NAME,
}: {
  loginPage: LoginPage;
  page: Page;
  workspaceName?: string;
}) => {
  const login = getRequiredEnv('DEFAULT_LOGIN');
  const password = getRequiredEnv('DEFAULT_PASSWORD');

  await page.waitForLoadState('domcontentloaded');
  await loginPage.clickLoginWithEmailIfVisible();
  await loginPage.typeEmail(login);
  await loginPage.clickContinueButton();
  await loginPage.typePassword(password);
  await page.waitForLoadState('domcontentloaded');

  const authSubmitButton = page.getByRole('button', {
    name: /Sign (in|up)/,
  });
  const signUpButton = page.getByRole('button', { name: 'Sign up' });

  await authSubmitButton.waitFor({ state: 'visible', timeout: 30000 });

  if (await isVisible(signUpButton)) {
    throw new Error(
      [
        `E2E default user "${login}" was not found by the auth flow.`,
        'The local E2E suite expects the development seed workspace.',
        'Run `npx nx database:reset twenty-server` before starting the backend, then rerun the E2E tests.',
      ].join(' '),
    );
  }

  await loginPage.clickSignInButton();
  await page.waitForLoadState('domcontentloaded');

  const workspaceButton = page.getByText(workspaceName, { exact: true });

  await workspaceButton
    .waitFor({ state: 'visible', timeout: 30000 })
    .catch(() => {
      // Single workspace mode skips the workspace picker.
    });

  if (await workspaceButton.isVisible()) {
    await workspaceButton.click();
  }

  await page.waitForFunction(
    () =>
      !window.location.href.includes('verify') &&
      !window.location.href.includes('welcome'),
    { timeout: 30000 },
  );
};
