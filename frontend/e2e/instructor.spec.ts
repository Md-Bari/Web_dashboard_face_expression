import { test, expect, signedInAs, openTab } from './fixtures';

signedInAs('teacher');

test.describe('Instructor workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/(Good (morning|afternoon|evening)|Welcome), Ayesha/)).toBeVisible();
  });

  test('the sidebar has no AI Insights page', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByRole('button', { name: 'Classes', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'AI Insights' })).toHaveCount(0);
  });

  test('creates a class and gets a section invite link', async ({ page }) => {
    await openTab(page, 'Classes');
    const code = `E2E-PW-${Date.now().toString(36).toUpperCase()}`; // removed by seed_e2e --clean
    await page.getByPlaceholder('Code, e.g. CSE-2024').fill(code);
    await page.getByPlaceholder('Name, e.g. Data Structures').fill('Playwright Class');
    await page.getByRole('button', { name: 'Create class' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`Playwright Class.*${code}`) })).toBeVisible();

    await page.getByLabel('Section', { exact: true }).selectOption({ label: 'Section A (0 students)' });
    await expect(page.getByText(/\/join\/[A-Z0-9]{8}/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  });

  test('starting a scheduled class opens its meeting in a new tab', async ({ page, seed }) => {
    await openTab(page, 'Sessions');
    const row = page.getByRole('group', { name: seed.startable.title });
    const [tab] = await Promise.all([
      page.waitForEvent('popup'),
      row.getByRole('button', { name: 'Start class' }).click(),
    ]);
    await expect(tab).toHaveURL(new RegExp(`/meet/${seed.startable.code}$`));
    await expect(tab.getByRole('button', { name: /Join as instructor|Start class & join/ })).toBeVisible();
    await expect(row.getByText('LIVE', { exact: true })).toBeVisible();
  });

  test('shows the report of an ended class and downloads it as CSV', async ({ page, seed }) => {
    await openTab(page, 'Sessions');
    await page.getByRole('group', { name: seed.ended.title }).getByRole('button', { name: 'Report' }).click();
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Nadia Islam/ })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /Download CSV/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
