import { request, type FullConfig } from '@playwright/test';
import { manage, saveData, storageState, type Role, type SeedData } from './seed';

/** Seed fresh data, then sign each role in once (the login endpoint allows 5 tries/min per user). */
export default async function globalSetup(config: FullConfig) {
  const lastLine = manage('seed_e2e').trim().split('\n').pop() ?? '';
  const data = JSON.parse(lastLine) as SeedData;
  saveData(data);

  const baseURL = config.projects[0].use.baseURL as string;
  for (const role of ['teacher', 'student', 'newbie'] as Role[]) {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post('/api/auth/login/', { data: { username: data[role], password: data.password } });
    if (!res.ok()) throw new Error(`Login as ${role} failed: ${res.status()} ${await res.text()}`);
    await ctx.storageState({ path: storageState(role) });
    await ctx.dispose();
  }
}
