import { test, expect, signedInAs } from './fixtures';

signedInAs('newbie');

test.describe('Joining a class from the student dashboard', () => {
  // The last test enrols the student, so the empty-state checks must run before it
  test.describe.configure({ mode: 'serial' });

  test('a student without classes sees the invite form', async ({ page }) => {
    await page.goto('/student');
    await expect(page.getByText('You are not in any class yet.')).toBeVisible();
    await expect(page.getByPlaceholder(/\/join\//)).toBeVisible();
  });

  test('rejects text that is not an invite link', async ({ page }) => {
    await page.goto('/student');
    await page.getByPlaceholder(/\/join\//).fill('hello there');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByText(/Paste the invite link/)).toBeVisible();
  });

  test('rejects an unknown invite code', async ({ page }) => {
    await page.goto('/student');
    await page.getByPlaceholder(/\/join\//).fill('ZZZZ9999');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByText(/not valid/i)).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('joins a class and section with a pasted invite link', async ({ page, seed, baseURL }) => {
    await page.goto('/student');
    await page.getByPlaceholder(/\/join\//).fill(`${baseURL}/join/${seed.net_invite}`);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByText(/You joined .*Computer Networks \(Section D\)/)).toBeVisible();
    const card = page.getByRole('article').filter({ hasText: seed.courses.net });
    await expect(card.getByText('Section D', { exact: true })).toBeVisible();
  });
});
