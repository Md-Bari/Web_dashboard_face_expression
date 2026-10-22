import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface SeedData {
  password: string;
  teacher: string;
  student: string;
  newbie: string;
  courses: { oop: string; db: string; net: string };
  net_invite: string;
  oop_invite_a: string;
  live: { id: number; title: string; code: string };
  upcoming: { id: number; title: string; code: string };
  startable: { id: number; title: string; code: string };
  ended: { id: number; title: string };
}

export type Role = 'teacher' | 'student' | 'newbie';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const AUTH_DIR = path.join(__dirname, '.auth');
const DATA_FILE = path.join(AUTH_DIR, 'data.json');

/** Run the backend's seed_e2e management command inside the Docker stack. */
export function manage(...args: string[]): string {
  return execFileSync('docker', ['compose', 'exec', '-T', 'backend', 'python', 'manage.py', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function saveData(data: SeedData) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

export function loadData(): SeedData {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

export const storageState = (role: Role) => path.join(AUTH_DIR, `${role}.json`);
