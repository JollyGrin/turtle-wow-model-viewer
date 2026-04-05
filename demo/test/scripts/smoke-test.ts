#!/usr/bin/env bun
/**
 * Quick smoke test — verify the test page loads both viewers.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: false,
  args: [],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

// Capture console logs and network requests
const consoleLogs: string[] = [];
page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

const failedRequests: string[] = [];
const zamRequests: string[] = [];
page.on('requestfailed', req => failedRequests.push(`FAILED: ${req.url()} — ${req.failure()?.errorText}`));
page.on('response', res => {
  const url = res.url();
  if (url.includes('zamimg') || url.includes('zamimg-proxy')) {
    zamRequests.push(`${res.status()} ${url}`);
  }
  if (res.status() >= 400) failedRequests.push(`${res.status()}: ${url}`);
});

console.log('Loading test page (human male, naked, front)...');
await page.goto('http://localhost:5173/test/?race=human&gender=male&angle=front');

// Wait longer for ZamImg to download, parse m2, and render the model
await page.waitForTimeout(20000);

// Check ZamImg internals
const zamState = await page.evaluate(() => {
  const w = window as any;
  return {
    hasZamModelViewer: typeof w.ZamModelViewer !== 'undefined',
    hasJQuery: typeof w.jQuery !== 'undefined',
    contentPath: w.CONTENT_PATH,
    zamContainerChildren: document.getElementById('zam-container')?.children.length,
    zamContainerHTML: document.getElementById('zam-container')?.innerHTML.substring(0, 200),
  };
});
console.log('ZamImg state:', JSON.stringify(zamState, null, 2));

const ready = await page.evaluate(() => (window as any).__TEST_READY);
const error = await page.evaluate(() => (window as any).__TEST_ERROR);
const loadState = await page.evaluate(() => document.getElementById('load-state')?.textContent);

console.log('TEST_READY:', ready);
console.log('TEST_ERROR:', error);
console.log('Load state:', loadState);

// Take screenshots of individual containers
const zamEl = await page.$('#zam-container');
const ourEl = await page.$('#our-container');

if (zamEl) {
  await zamEl.screenshot({ path: '/tmp/regression-zam.png' });
  console.log('ZamImg screenshot: /tmp/regression-zam.png');
}
if (ourEl) {
  await ourEl.screenshot({ path: '/tmp/regression-ours.png' });
  console.log('Our screenshot: /tmp/regression-ours.png');
}
await page.screenshot({ path: '/tmp/regression-test-smoke.png', fullPage: true });

// Check ZamImg canvas content
const zamHasContent = await page.evaluate(() => {
  const canvas = document.querySelector('#zam-container canvas') as HTMLCanvasElement;
  if (!canvas) return false;
  const ctx = canvas.getContext('2d') || canvas.getContext('webgl') || canvas.getContext('webgl2');
  // Check if any non-black pixels exist
  if (canvas.getContext('2d')) {
    const data = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 10 || data[i+1] > 10 || data[i+2] > 10) return true;
    }
  }
  return 'canvas-exists-but-cannot-read-webgl';
});
console.log('ZamImg canvas has content:', zamHasContent);

// Print console errors
const errors = consoleLogs.filter(l => l.startsWith('[error]'));
if (errors.length > 0) {
  console.log('\nConsole errors:');
  for (const e of errors.slice(0, 10)) console.log(' ', e);
}

if (zamRequests.length > 0) {
  console.log('\nAll zamimg requests:');
  for (const r of zamRequests.slice(0, 30)) console.log(' ', r);
}

if (failedRequests.length > 0) {
  console.log('\nFailed/404 requests:');
  for (const r of failedRequests.slice(0, 20)) console.log(' ', r);
}

// Print all console warnings too
const warns = consoleLogs.filter(l => l.startsWith('[warning]'));
if (warns.length > 0) {
  console.log('\nConsole warnings:');
  for (const w of warns.slice(0, 10)) console.log(' ', w);
}

await browser.close();
console.log('\nDone.');
