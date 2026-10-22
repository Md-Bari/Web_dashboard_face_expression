import { test, expect, signedInAs } from './fixtures';

signedInAs('student');

// Stops at the lobby: entering the room would connect to the real LiveKit project.
test.describe('Class meeting lobby', () => {
  // The first test gives consent; the dashboard check after it relies on that
  test.describe.configure({ mode: 'serial' });

  test('asks for consent, then shows the camera lobby of a live class', async ({ page, seed }) => {
    await page.goto(`/meet/${seed.live.code}`);
    await expect(page.getByText(seed.live.title)).toBeVisible();
    await expect(page.getByText(/Camera & privacy consent/)).toBeVisible();
    await page.getByRole('button', { name: 'I understand & agree' }).click();
    await expect(page.getByRole('button', { name: /^Join class/ })).toBeVisible();
  });

  test('a scheduled class offers to wait in the lobby', async ({ page, seed }) => {
    await page.goto(`/meet/${seed.upcoming.code}`);
    await expect(page.getByText(seed.upcoming.title)).toBeVisible();
    await expect(page.getByRole('button', { name: /Join & wait for the class/ })).toBeVisible();
  });

  test('the dashboard shows the consent afterwards', async ({ page }) => {
    await page.goto('/student');
    await expect(page.getByText(/You gave consent/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Withdraw consent' })).toBeVisible();
  });

  test('an unknown meeting code shows an error', async ({ page }) => {
    await page.goto('/meet/NOPE0000');
    await expect(page.getByText(/not valid|not found|no class/i)).toBeVisible();
  });
});
