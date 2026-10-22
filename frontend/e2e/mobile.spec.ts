import { test, expect, signedInAs } from './fixtures';

signedInAs('student');

test('student dashboard fits a phone screen', async ({ page, seed }) => {
  await page.goto('/student');
  await expect(page.getByRole('heading', { name: /Hi Nadia/ })).toBeVisible();
  await expect(page.getByText(seed.live.title).first()).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
