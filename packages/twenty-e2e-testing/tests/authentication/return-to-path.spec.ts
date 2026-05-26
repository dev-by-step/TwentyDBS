import { expect, test as base } from '@playwright/test';
import { LoginPage } from '../../lib/pom/loginPage';
import { loginWithDefaultUserAndSelectWorkspace } from '../../lib/utils/login';

const test = base.extend<{ loginPage: LoginPage }>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
});

test.describe('Return-to-path after login', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to deep link after login', async ({
    page,
    loginPage,
  }) => {
    const deepLink = '/settings/accounts';

    await test.step('Navigate to deep link while logged out', async () => {
      await page.goto(deepLink);
      await page.waitForURL('**/welcome');
      await page.waitForLoadState('domcontentloaded');
    });

    await test.step('Log in and select workspace', async () => {
      await loginWithDefaultUserAndSelectWorkspace({ loginPage, page });
    });

    await test.step('Verify redirected to original deep link', async () => {
      await page.waitForURL(`**${deepLink}`, {
        timeout: 30000,
        waitUntil: 'commit',
      });
      expect(new URL(page.url()).pathname).toBe(deepLink);
    });

    await test.step('Verify return-to-path query param was consumed', async () => {
      const url = new URL(page.url());

      expect(url.searchParams.has('returnToPath')).toBe(false);
    });
  });

  test('should preserve path with query params across login', async ({
    page,
    loginPage,
  }) => {
    const targetPath = '/settings/accounts';
    const targetPathWithParams = `${targetPath}?tab=emails&filter=unread`;

    await test.step('Navigate to path with query params while logged out', async () => {
      await page.goto(targetPathWithParams);
      await page.waitForURL('**/welcome');
      await page.waitForLoadState('domcontentloaded');
    });

    await test.step('Log in and select workspace', async () => {
      await loginWithDefaultUserAndSelectWorkspace({ loginPage, page });
    });

    await test.step('Verify redirected to original path with query params', async () => {
      await page.waitForURL(`**${targetPath}**`, {
        timeout: 30000,
        waitUntil: 'commit',
      });
      const url = new URL(page.url());

      expect(url.pathname).toBe(targetPath);
      expect(url.searchParams.get('tab')).toBe('emails');
      expect(url.searchParams.get('filter')).toBe('unread');
    });
  });
});
