import { test as base, expect, type Page } from '@playwright/test';
import { loadData, storageState, type Role, type SeedData } from './seed';

export const test = base.extend<{ seed: SeedData }>({
  seed: async ({}, provide) => provide(loadData()),
});

/** Run the tests of a file signed in as one of the seeded accounts. */
export const signedInAs = (role: Role) => test.use({ storageState: storageState(role) });

/** Open a dashboard tab from the instructor sidebar. */
export async function openTab(page: Page, name: string) {
  await page.getByRole('complementary').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
}

export { expect };
