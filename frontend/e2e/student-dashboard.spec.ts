import { test, expect, signedInAs } from './fixtures';

signedInAs('student');

test.describe('Student dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student');
    await expect(page.getByRole('heading', { name: /Hi Nadia/ })).toBeVisible();
  });

  test("shows one card per class with the student's own section", async ({ page, seed }) => {
    const oop = page.getByRole('article').filter({ hasText: seed.courses.oop });
    const db = page.getByRole('article').filter({ hasText: seed.courses.db });
    await expect(oop.getByText('Section A', { exact: true })).toBeVisible();
    await expect(db.getByText('Section C', { exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(2);
  });

  test("lists the live class and hides other sections' classes", async ({ page, seed }) => {
    const liveNow = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Live now' }) });
    await expect(liveNow.getByText(seed.live.title)).toBeVisible();
    await expect(page.getByText('Section B lab')).toHaveCount(0);
    await expect(liveNow.getByRole('link', { name: 'Join class' })).toHaveAttribute('href', `/meet/${seed.live.code}`);
  });

  test('shows upcoming sessions with a countdown and past sessions', async ({ page, seed }) => {
    const db = page.getByRole('article').filter({ hasText: seed.courses.db });
    await expect(db.getByText(seed.upcoming.title)).toBeVisible();
    await expect(db.getByText(/starts in 2 h/)).toBeVisible();
    await expect(db.getByRole('link', { name: 'Join & wait' })).toHaveAttribute('href', `/meet/${seed.upcoming.code}`);

    const oop = page.getByRole('article').filter({ hasText: seed.courses.oop });
    await expect(oop.getByText(seed.ended.title)).toBeVisible();
  });

  test('filters the cards by class', async ({ page, seed }) => {
    await page.getByRole('button', { name: new RegExp(seed.courses.db) }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText(seed.courses.db);
    await page.getByRole('button', { name: 'All classes' }).click();
    await expect(page.getByRole('article')).toHaveCount(2);
  });

  test('shows the consent status', async ({ page }) => {
    await expect(page.getByText('Camera & expression analysis')).toBeVisible();
    // Given or not depends on whether the lobby test ran first; either way a status is shown
    await expect(page.getByText(/You (gave|have not given) consent/)).toBeVisible();
  });
});
