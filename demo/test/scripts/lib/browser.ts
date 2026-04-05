/**
 * Playwright browser helpers for the regression test runner.
 */
import { chromium, type Browser, type Page } from 'playwright';

let browser: Browser | null = null;

/** Launch headless Chromium with WebGL support (SwiftShader). */
export async function launchBrowser(): Promise<Browser> {
  if (browser) return browser;
  browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--disable-web-security',  // Allow ZamImg cross-origin requests
      '--disable-features=VizDisplayCompositor',
    ],
  });
  return browser;
}

/** Close the shared browser instance. */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/** Navigate to the test page and wait for it to be ready. */
export async function loadTestPage(
  page: Page,
  baseUrl: string,
  params: { race: string; gender: string; items: number[]; angle: string }
): Promise<void> {
  const url = new URL('/test/', baseUrl);
  url.searchParams.set('race', params.race);
  url.searchParams.set('gender', params.gender);
  if (params.items.length > 0) url.searchParams.set('items', params.items.join(','));
  url.searchParams.set('angle', params.angle);

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });

  // Wait for the test page to signal readiness (max 45s)
  await page.waitForFunction('window.__TEST_READY === true', {}, { timeout: 45000 }).catch(() => {
    // Check if there was an error
    return page.evaluate(() => (window as any).__TEST_ERROR).then(err => {
      if (err) throw new Error(`Test page error: ${err}`);
      throw new Error('Test page timed out waiting for __TEST_READY');
    });
  });

  // Extra settle time for rendering
  await page.waitForTimeout(2000);
}

/** Navigate to the grid page and wait for all models to load. */
export async function loadGridPage(
  page: Page,
  baseUrl: string,
  items?: number[]
): Promise<void> {
  const url = new URL('/test/grid/', baseUrl);
  if (items?.length) url.searchParams.set('items', items.join(','));

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__GRID_READY === true', {}, { timeout: 120000 });
  await page.waitForTimeout(1000);
}

/** Screenshot a specific element and return the PNG buffer. */
export async function screenshotElement(page: Page, selector: string): Promise<Buffer> {
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return (await el.screenshot({ type: 'png' })) as Buffer;
}
