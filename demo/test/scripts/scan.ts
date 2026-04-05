#!/usr/bin/env bun
/**
 * SCANNER LOOP — Iterates the test matrix, screenshots both viewers, diffs them.
 *
 * Usage:
 *   bun run scripts/scan.ts                                   # full matrix
 *   bun run scripts/scan.ts --race=human                      # single race
 *   bun run scripts/scan.ts --gender=male                     # single gender
 *   bun run scripts/scan.ts --items=naked                     # single item set
 *   bun run scripts/scan.ts --race=human --items=naked        # specific combo
 *   bun run scripts/scan.ts --force                           # re-scan everything
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { launchBrowser, closeBrowser, loadTestPage, screenshotElement } from './lib/browser';
import { comparePngs } from './lib/pixel-diff';
import { diagnose } from './lib/diagnosis';
import {
  ensureDirs, comboId, writeMeta, readMeta, saveImage, RESULTS_DIR,
  type IssueMeta,
} from './lib/issue-store';

// --- Config ---
const CONFIG_DIR = resolve(import.meta.dirname, '../config');
const matrix = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'test-matrix.json'), 'utf-8'));
const thresholds = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'thresholds.json'), 'utf-8'));
const learnings = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'learnings.json'), 'utf-8'));

// --- CLI args ---
const args = process.argv.slice(2);
const argMap: Record<string, string> = {};
for (const arg of args) {
  const [key, val] = arg.replace(/^--/, '').split('=');
  argMap[key] = val ?? 'true';
}
const filterRace = argMap['race'];
const filterGender = argMap['gender'];
const filterItems = argMap['items'];
const force = 'force' in argMap;

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// --- Build combo list ---
interface TestCombo {
  race: string;
  gender: string;
  itemSet: { id: string; items: number[] };
  angle: string;
}

const combos: TestCombo[] = [];
for (const race of matrix.races) {
  if (filterRace && race !== filterRace) continue;
  for (const gender of matrix.genders) {
    if (filterGender && gender !== filterGender) continue;
    for (const itemSet of matrix.itemSets) {
      if (filterItems && itemSet.id !== filterItems) continue;
      for (const angle of matrix.angles) {
        combos.push({ race, gender, itemSet, angle });
      }
    }
  }
}

// --- Filter out already-scanned ---
function shouldSkip(combo: TestCombo): string | null {
  const id = comboId(combo.race, combo.gender, combo.itemSet.id, combo.angle);

  // Check skip patterns
  for (const sp of learnings.skipPatterns || []) {
    const regex = new RegExp('^' + sp.pattern.replace(/\*/g, '.*') + '$');
    if (regex.test(id)) return `Skip pattern: ${sp.reason}`;
  }

  // Check already verified/approved
  const meta = readMeta(id);
  if (meta && (meta.status === 'verified' || meta.status === 'human-approved')) {
    return `Already ${meta.status}`;
  }

  // Check scannedCombos (unless --force)
  if (!force && learnings.scannedCombos?.includes(id)) {
    return 'Already scanned (pass)';
  }

  return null;
}

// --- Main ---
async function main() {
  ensureDirs();

  const toScan = combos.filter(c => {
    const reason = shouldSkip(c);
    if (reason) {
      console.log(`  SKIP ${comboId(c.race, c.gender, c.itemSet.id, c.angle)} — ${reason}`);
      return false;
    }
    return true;
  });

  console.log(`\nScanning ${toScan.length} combos (${combos.length} total, ${combos.length - toScan.length} skipped)\n`);

  if (toScan.length === 0) {
    console.log('Nothing to scan.');
    return;
  }

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

  const summary = {
    timestamp: new Date().toISOString(),
    total: toScan.length,
    pass: 0,
    review: 0,
    fail: 0,
    error: 0,
    issues: [] as string[],
  };

  for (let i = 0; i < toScan.length; i++) {
    const combo = toScan[i];
    const id = comboId(combo.race, combo.gender, combo.itemSet.id, combo.angle);
    const progress = `[${i + 1}/${toScan.length}]`;

    try {
      await loadTestPage(page, BASE_URL, {
        race: combo.race,
        gender: combo.gender,
        items: combo.itemSet.items,
        angle: combo.angle,
      });

      // Screenshot both containers
      const zamPng = await screenshotElement(page, '#zam-container');
      const ourPng = await screenshotElement(page, '#our-container');

      // Compare
      const diff = comparePngs(zamPng, ourPng);
      const diagnosis = diagnose(diff.diffBuffer, diff.diffPct);

      // Determine threshold based on category
      const categoryThreshold = thresholds.perCategory?.[diagnosis.category] ?? thresholds.review;

      if (diff.diffPct > categoryThreshold) {
        // Issue found
        saveImage(id, 'zam.png', zamPng);
        saveImage(id, 'ours.png', ourPng);
        saveImage(id, 'diff.png', diff.diffBuffer);

        const meta: IssueMeta = {
          id,
          race: combo.race,
          gender: combo.gender,
          itemSet: combo.itemSet.id,
          angle: combo.angle,
          diffPct: Math.round(diff.diffPct * 100) / 100,
          category: diagnosis.category,
          status: 'open',
          timestamp: new Date().toISOString(),
        };
        writeMeta(id, meta);

        const label = diff.diffPct > thresholds.review ? 'FAIL' : 'REVIEW';
        console.log(`${progress} ${label} ${id} — ${diff.diffPct.toFixed(1)}% (${diagnosis.category}: ${diagnosis.description})`);

        if (label === 'FAIL') summary.fail++;
        else summary.review++;
        summary.issues.push(id);
      } else {
        // Pass — log to scannedCombos
        console.log(`${progress} PASS ${id} — ${diff.diffPct.toFixed(1)}%`);
        summary.pass++;

        if (!learnings.scannedCombos.includes(id)) {
          learnings.scannedCombos.push(id);
        }
      }
    } catch (err) {
      console.error(`${progress} ERROR ${id} — ${(err as Error).message}`);
      summary.error++;
    }
  }

  // Save updated learnings (scannedCombos)
  writeFileSync(resolve(CONFIG_DIR, 'learnings.json'), JSON.stringify(learnings, null, 2));

  // Save summary
  writeFileSync(resolve(RESULTS_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  await closeBrowser();

  console.log('\n=== Scan Summary ===');
  console.log(`  Pass:   ${summary.pass}`);
  console.log(`  Review: ${summary.review}`);
  console.log(`  Fail:   ${summary.fail}`);
  console.log(`  Error:  ${summary.error}`);
  if (summary.issues.length > 0) {
    console.log(`\n  Issues:`);
    for (const id of summary.issues) console.log(`    - ${id}`);
  }
}

main().catch(err => {
  console.error('Scanner failed:', err);
  process.exit(1);
});
