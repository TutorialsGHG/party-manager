import { test, expect } from '@playwright/test';

test.describe('Einladung App - E2E Smoke & Responsiveness Suite', () => {
  const viewports = [
    { name: 'Mobile Minimal', width: 320, height: 568 },
    { name: 'Mobile Modern', width: 375, height: 812 },
    { name: 'Tablet iPad', width: 768, height: 1024 },
    { name: 'Desktop Standard', width: 1280, height: 800 }
  ];

  for (const vp of viewports) {
    test(`renders login page properly on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');

      // Check title or brand heading
      await expect(page).toHaveTitle(/Einladung/);

      // Verify email & password fields are visible
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitBtn = page.locator('button[type="submit"]');

      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      await expect(submitBtn).toBeVisible();

      // Check for horizontal overflow (no horizontal scrollbar on mobile)
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test(`renders register page properly on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/register');

      await expect(page).toHaveTitle(/Einladung/);

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');

      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    });
  }

  test('redirects root / to /dashboard or /login', async ({ page }) => {
    await page.goto('/');
    expect(page.url()).toMatch(/\/(dashboard|login)$/);
  });
});
