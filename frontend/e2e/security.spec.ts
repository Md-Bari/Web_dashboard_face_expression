import { test, expect } from '@playwright/test';

// API-level checks of the hardening; no browser page needed.
test.describe('Security settings', () => {
  test('repeated wrong passwords for one account are throttled', async ({ request }) => {
    const username = `e2e_pw_throttle_${Date.now()}`;
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request.post('/api/auth/login/', { data: { username, password: 'wrong' } });
      codes.push(res.status());
    }
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[5]).toBe(429);
  });

  test('the guest roster is closed', async ({ request }) => {
    expect((await request.get('/api/public/live-session/')).status()).toBe(403);
  });

  test('other websites get no CORS access', async ({ request }) => {
    const res = await request.get('/api/courses/', { headers: { Origin: 'https://evil.example' } });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('unknown hosts are refused and errors show no debug page', async ({ request }) => {
    expect((await request.get('/api/auth/me/', { headers: { Host: 'evil.example' } })).status()).toBe(400);
    const notFound = await request.get('/api/does-not-exist/');
    expect(notFound.status()).toBe(404);
    expect(await notFound.text()).not.toContain('URLconf');
  });
});
