import { test, expect } from './fixtures';

test.describe('Sign in', () => {
  test('rejects a wrong password with a message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('e2e_pw_nobody');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/no active account|invalid|incorrect/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('a student lands on the student dashboard', async ({ page, seed }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(seed.student);
    await page.getByLabel('Password').fill(seed.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole('heading', { name: /Hi Nadia/ })).toBeVisible();
  });

  test('an instructor lands on the instructor dashboard', async ({ page, seed }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(seed.teacher);
    await page.getByLabel('Password').fill(seed.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/(Good (morning|afternoon|evening)|Welcome), Ayesha/)).toBeVisible();
  });

  test('signed-out visitors are sent to the sign-in page', async ({ page }) => {
    for (const path of ['/', '/student']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('the login page offers no guest access', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText(/guest/i)).toHaveCount(0);
  });
});
