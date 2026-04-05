#!/usr/bin/env bun
/**
 * Camera calibration — inspect both viewers' camera state to align them.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, args: [] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

console.log('Loading test page...');
await page.goto('http://localhost:5173/test/?race=human&gender=male&angle=front');

// Wait for both viewers (ZamImg in iframe + ours)
await page.waitForFunction('window.__TEST_READY === true', {}, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000);

// Inspect ZamImg camera
const zamCamera = await page.evaluate(() => {
  const w = window as any;
  // Find viewer by scanning globals for objects with a renderer.actors array
  let viewer: any = null;
  for (const key of Object.getOwnPropertyNames(w)) {
    try {
      const v = w[key];
      if (v && typeof v === 'object' && v.renderer && v.renderer.actors) {
        viewer = v;
        break;
      }
    } catch {}
  }

  if (!viewer) return { viewerFound: false };

  const r = viewer.renderer;
  return {
    viewerFound: true,
    azimuth: r?.azimuth,
    zenith: r?.zenith,
    distance: r?.distance,
    zoom: r?.zoom,
    actorCount: r?.actors?.length,
  };
});

console.log('\nZamImg camera:', JSON.stringify(zamCamera, null, 2));

// Use clip-based screenshots (element.screenshot doesn't capture WebGL canvases)
const zamBox = await page.locator('#zam-container').boundingBox();
const ourBox = await page.locator('#our-container').boundingBox();
if (zamBox) await page.screenshot({ path: '/tmp/calibrate-zam.png', clip: zamBox });
if (ourBox) await page.screenshot({ path: '/tmp/calibrate-ours.png', clip: ourBox });
await page.screenshot({ path: '/tmp/calibrate-full.png', fullPage: true });

console.log('Screenshots saved to /tmp/calibrate-*.png');
await browser.close();
