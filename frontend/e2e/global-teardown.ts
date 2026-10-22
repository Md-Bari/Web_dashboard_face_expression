import { manage } from './seed';

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DATA) return; // keep the seeded data to debug a failure
  manage('seed_e2e', '--clean');
}
