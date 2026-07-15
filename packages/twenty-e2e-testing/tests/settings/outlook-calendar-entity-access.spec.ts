import { expect, test } from '@playwright/test';

test.skip(
  !process.env.DEFAULT_LOGIN || !process.env.DEFAULT_PASSWORD,
  'E2E auth setup requires a seeded DB and DEFAULT_LOGIN/DEFAULT_PASSWORD env vars. Run `npx nx database:reset twenty-server` and set .env before running this test.',
);

test('Connecting Outlook calendar asks which entities can see imported event details', async ({
  page,
}) => {
  let microsoftOAuthUrl: URL | undefined;

  await page.route('**/auth/microsoft-apis**', async (route) => {
    microsoftOAuthUrl = new URL(route.request().url());

    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>Microsoft OAuth intercepted</body></html>',
    });
  });

  await page.goto('/settings/accounts/new');

  await page.getByRole('button', { name: 'Connect with Microsoft' }).click();

  await expect(
    page.getByRole('heading', { name: 'Calendar access' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Choose which internal entities can see the full details of this Outlook calendar.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'This only controls visibility of imported event details. Managing or disconnecting the Outlook account remains limited to the account owner.',
    ),
  ).toBeVisible();

  const entityButtons = page.getByTestId(
    'microsoft-calendar-visible-internal-entity',
  );

  await expect(entityButtons.first()).toBeVisible();

  const firstEntityButton = entityButtons.first();
  const firstEntityId = await firstEntityButton.getAttribute('data-entity-id');

  expect(firstEntityId).not.toBeNull();

  if ((await firstEntityButton.getAttribute('aria-pressed')) !== 'true') {
    await firstEntityButton.click();
  }

  await expect(firstEntityButton).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Connect' }).click();

  await expect(page.getByText('Microsoft OAuth intercepted')).toBeVisible();

  expect(microsoftOAuthUrl).toBeDefined();
  expect(microsoftOAuthUrl?.pathname).toBe('/auth/microsoft-apis');
  expect(microsoftOAuthUrl?.searchParams.get('calendarVisibility')).toBe(
    'METADATA',
  );
  expect(
    microsoftOAuthUrl?.searchParams.get('skipMessageChannelConfiguration'),
  ).toBe('true');
  expect(
    microsoftOAuthUrl?.searchParams
      .get('visibleInternalEntityIds')
      ?.split(',')
      .filter(Boolean),
  ).toContain(firstEntityId);
});
