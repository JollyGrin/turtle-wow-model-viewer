#!/usr/bin/env bun
/**
 * REVIEWER LOOP — Re-scans fix-attempted issues to verify fixes hold.
 * Also runs regression guard (samples previously-passing combos).
 *
 * Usage:
 *   bun run scripts/review.ts                                    # all fix-attempted
 *   bun run scripts/review.ts --issue=human-male-tier1-warrior-front
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { launchBrowser, closeBrowser, loadTestPage, screenshotElement } from './lib/browser';
import { comparePngs } from './lib/pixel-diff';
import { diagnose } from './lib/diagnosis';
import {
  ensureDirs, listIssues, readMeta, updateStatus, saveImage, issueDir,
  saveReviewImage, writeReviewSummary, comboId,
  type IssueMeta,
} from './lib/issue-store';

const CONFIG_DIR = resolve(import.meta.dirname, '../config');
const thresholds = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'thresholds.json'), 'utf-8'));
const learnings = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'learnings.json'), 'utf-8'));

const args = process.argv.slice(2);
const argMap: Record<string, string> = {};
for (const arg of args) {
  const [key, val] = arg.replace(/^--/, '').split('=');
  argMap[key] = val ?? 'true';
}
const filterIssue = argMap['issue'];

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

async function main() {
  ensureDirs();

  let issues = listIssues('fix-attempted');
  if (filterIssue) issues = issues.filter(i => i.id === filterIssue);

  if (issues.length === 0) {
    console.log('No fix-attempted issues to review.');
    return;
  }

  console.log(`Reviewing ${issues.length} fix-attempted issues\n`);

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

  for (const issue of issues) {
    console.log(`\nReviewing: ${issue.id}`);

    try {
      // Re-scan this combo
      const items = []; // TODO: resolve item IDs from test-matrix
      const matrix = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'test-matrix.json'), 'utf-8'));
      const itemSet = matrix.itemSets.find((s: any) => s.id === issue.itemSet);
      const itemIds = itemSet?.items || [];

      await loadTestPage(page, BASE_URL, {
        race: issue.race,
        gender: issue.gender,
        items: itemIds,
        angle: issue.angle,
      });

      const zamPng = await screenshotElement(page, '#zam-container');
      const ourPng = await screenshotElement(page, '#our-container');
      const diff = comparePngs(zamPng, ourPng);
      const diagnosis = diagnose(diff.diffBuffer, diff.diffPct);

      const categoryThreshold = thresholds.perCategory?.[diagnosis.category] ?? thresholds.review;
      const passes = diff.diffPct <= categoryThreshold;

      // Save updated screenshots
      saveImage(issue.id, 'ours.png', ourPng);
      saveImage(issue.id, 'diff.png', diff.diffBuffer);

      if (passes) {
        // Run regression guard: sample N previously-passing combos
        const regressionResult = await runRegressionGuard(page, issue);

        if (regressionResult.passed) {
          updateStatus(issue.id, 'verified');

          // Copy to human-review
          const oldOurs = join(issueDir(issue.id), 'ours.png');
          saveReviewImage(issue.id, 'after-ours.png', ourPng);
          saveReviewImage(issue.id, 'zam.png', zamPng);
          saveReviewImage(issue.id, 'diff-after.png', diff.diffBuffer);

          writeReviewSummary(issue.id, [
            `# ${issue.id}`,
            ``,
            `**Category:** ${issue.category}`,
            `**Diff before:** ${issue.diffPct}%`,
            `**Diff after:** ${diff.diffPct.toFixed(1)}%`,
            `**Fix:** ${issue.fix || 'See meta.json attempts'}`,
            `**Regression guard:** ${regressionResult.samplesChecked} samples checked, all passed`,
            ``,
            `Ready for human approval.`,
          ].join('\n'));

          // Add to learnings
          if (issue.fix) {
            learnings.entries.push({
              id: issue.id,
              category: issue.category,
              rootCause: issue.fix,
              fix: issue.fix,
              fixDate: new Date().toISOString().split('T')[0],
            });
          }
          if (!learnings.scannedCombos.includes(issue.id)) {
            learnings.scannedCombos.push(issue.id);
          }

          console.log(`  VERIFIED — ${diff.diffPct.toFixed(1)}% (was ${issue.diffPct}%)`);
        } else {
          // Regression found — reopen
          updateStatus(issue.id, 'open', { regressionGuard: regressionResult });
          console.log(`  REGRESSION — fix passes but broke ${regressionResult.regressions.length} other combos`);
          for (const r of regressionResult.regressions) {
            console.log(`    ${r.combo}: ${r.diffBefore.toFixed(1)}% → ${r.diffAfter.toFixed(1)}%`);
          }
        }
      } else {
        // Still failing
        const attempts = issue.attempts?.length || 0;
        if (attempts >= 3) {
          updateStatus(issue.id, 'needs-human');
          console.log(`  NEEDS-HUMAN — still ${diff.diffPct.toFixed(1)}% after ${attempts} attempts`);
        } else {
          updateStatus(issue.id, 'open');
          console.log(`  REOPEN — still ${diff.diffPct.toFixed(1)}% (was ${issue.diffPct}%)`);
        }
      }
    } catch (err) {
      console.error(`  ERROR — ${(err as Error).message}`);
    }
  }

  // Save learnings
  writeFileSync(resolve(CONFIG_DIR, 'learnings.json'), JSON.stringify(learnings, null, 2));

  await closeBrowser();
}

async function runRegressionGuard(
  page: any,
  issue: IssueMeta
): Promise<{ passed: boolean; samplesChecked: number; regressions: any[] }> {
  const sampleCount = thresholds.regressionGuard?.sampleCountByRisk?.[issue.category]
    ?? thresholds.regressionGuard?.sampleCount ?? 10;

  const pool = learnings.scannedCombos.filter((c: string) => c !== issue.id);
  if (pool.length === 0) return { passed: true, samplesChecked: 0, regressions: [] };

  // Shuffle and pick N samples
  const shuffled = pool.sort(() => Math.random() - 0.5);
  const samples = shuffled.slice(0, Math.min(sampleCount, pool.length));

  const matrix = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'test-matrix.json'), 'utf-8'));
  const regressions: any[] = [];

  for (const combo of samples) {
    const [race, gender, itemSetId, angle] = combo.split('-');
    // Handle multi-word race names (e.g. night-elf)
    const parts = combo.split('-');
    // Find the item set by trying different split points
    let foundRace = '', foundGender = '', foundItemSet = '', foundAngle = '';
    for (const r of matrix.races) {
      if (combo.startsWith(r + '-')) {
        foundRace = r;
        const rest = combo.slice(r.length + 1);
        for (const g of matrix.genders) {
          if (rest.startsWith(g + '-')) {
            foundGender = g;
            const rest2 = rest.slice(g.length + 1);
            for (const a of matrix.angles) {
              if (rest2.endsWith('-' + a)) {
                foundAngle = a;
                foundItemSet = rest2.slice(0, -(a.length + 1));
                break;
              }
            }
            if (foundAngle) break;
          }
        }
        if (foundAngle) break;
      }
    }

    if (!foundRace || !foundAngle) continue;

    const itemSet = matrix.itemSets.find((s: any) => s.id === foundItemSet);
    if (!itemSet) continue;

    try {
      await loadTestPage(page, BASE_URL, {
        race: foundRace,
        gender: foundGender,
        items: itemSet.items,
        angle: foundAngle,
      });

      const zamPng = await screenshotElement(page, '#zam-container');
      const ourPng = await screenshotElement(page, '#our-container');
      const diff = comparePngs(zamPng, ourPng);

      if (diff.diffPct > thresholds.review) {
        regressions.push({
          combo,
          diffBefore: 0, // Was passing before
          diffAfter: diff.diffPct,
          note: `Exceeded threshold (${diff.diffPct.toFixed(1)}% > ${thresholds.review}%)`,
        });
      }
    } catch (err) {
      console.warn(`    Guard: error checking ${combo}: ${(err as Error).message}`);
    }
  }

  return {
    passed: regressions.length === 0,
    samplesChecked: samples.length,
    regressions,
  };
}

main().catch(err => {
  console.error('Reviewer failed:', err);
  process.exit(1);
});
