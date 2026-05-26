import { test as base, expect } from '@playwright/test';
import path from 'path';
import { LoginPage } from '../lib/pom/loginPage';
import { loginWithDefaultUserAndSelectWorkspace } from '../lib/utils/login';

// fixture
const test = base.extend<{ loginPage: LoginPage }>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
});

test('Login test', async ({ loginPage, page }) => {
  await test.step('Navigated to login page', async () => {
    await page.goto('/');
  });
  await test.step(
    'Logging in '.concat(page.url(), ' as ', process.env.DEFAULT_LOGIN),
    async () => {
      await loginWithDefaultUserAndSelectWorkspace({ loginPage, page });
      await expect(page.getByText(/Welcome, .+/)).not.toBeVisible();
      process.env.LINK = page.url();
    },
  );

  await test.step('Saved auth state', async () => {
    await page.context().storageState({
      path: path.resolve(__dirname, '..', '.auth', 'user.json'),
    });
  });
});
