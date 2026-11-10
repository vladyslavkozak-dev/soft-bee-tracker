import { expect, type Page, type Response, test } from '@playwright/test';

import { isNonLocalUrl } from '../src/lib/supabase/env-safeguards';

const SECRET_CANARY = process.env.E2E_SECRET_CANARY;
const REAL_SECRET_KEY_PATTERN = /sb_secret_[A-Za-z0-9_-]+/;

test.describe('Frontend and environment safeguards (E2E)', () => {
  test('renders login page without exposing server-side keys or calling non-local hosts', async ({ page }) => {
    const blockedRequests = await blockNonLocalRequests(page);
    const pendingScriptPayloads: Promise<string | null>[] = [];

    page.on('response', (response) => {
      if (isNextStaticScript(response)) {
        pendingScriptPayloads.push(readResponseText(response));
      }
    });

    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const pageHtml = await page.content();
    const clientScriptPayloads = (await Promise.all(pendingScriptPayloads)).filter((payload) => payload !== null);

    expect(SECRET_CANARY, 'E2E_SECRET_CANARY must be set by playwright.config.ts').toBeTruthy();
    expect(clientScriptPayloads.length).toBeGreaterThan(0);

    for (const content of [pageHtml, ...clientScriptPayloads]) {
      expect(content).not.toContain(SECRET_CANARY);
      expect(content).not.toMatch(REAL_SECRET_KEY_PATTERN);
    }

    expect(blockedRequests).toEqual([]);
  });

  test('redirects unauthenticated users from protected dashboard to login', async ({ page }) => {
    const blockedRequests = await blockNonLocalRequests(page);

    await page.goto('/dashboard');
    // the requested page rides along in ?next= so login can return to it
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    expect(blockedRequests).toEqual([]);
  });
});

function isNextStaticScript(response: Response): boolean {
  const { pathname } = new URL(response.url());
  return response.request().resourceType() === 'script' && pathname.includes('/_next/static/');
}

async function readResponseText(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

async function blockNonLocalRequests(page: Page): Promise<string[]> {
  const blockedRequests: string[] = [];

  await page.route('**/*', async (route) => {
    const url = route.request().url();

    if (/^https?:/.test(url) && isNonLocalUrl(url)) {
      blockedRequests.push(url);
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });

  return blockedRequests;
}
