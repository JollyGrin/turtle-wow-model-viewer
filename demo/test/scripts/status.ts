#!/usr/bin/env bun
/**
 * STATUS — Print a dashboard of the current test state.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { listIssues, RESULTS_DIR } from './lib/issue-store';

const CONFIG_DIR = resolve(import.meta.dirname, '../config');
const learnings = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'learnings.json'), 'utf-8'));

// Summary from last scan
const summaryPath = resolve(RESULTS_DIR, 'summary.json');
const summary = existsSync(summaryPath)
  ? JSON.parse(readFileSync(summaryPath, 'utf-8'))
  : null;

// Issues by status
const open = listIssues('open');
const fixAttempted = listIssues('fix-attempted');
const verified = listIssues('verified');
const approved = listIssues('human-approved');
const needsHuman = listIssues('needs-human');

console.log('=== Regression Test Status ===\n');

if (summary) {
  console.log(`Last scan: ${summary.timestamp}`);
  console.log(`  Total: ${summary.total} | Pass: ${summary.pass} | Review: ${summary.review} | Fail: ${summary.fail} | Error: ${summary.error}`);
} else {
  console.log('No scan results yet. Run: bun run scripts/scan.ts');
}

console.log(`\nIssues:`);
console.log(`  Open:           ${open.length}`);
console.log(`  Fix-attempted:  ${fixAttempted.length}`);
console.log(`  Verified:       ${verified.length}`);
console.log(`  Human-approved: ${approved.length}`);
console.log(`  Needs-human:    ${needsHuman.length}`);

console.log(`\nLearnings:`);
console.log(`  Entries:        ${learnings.entries?.length || 0}`);
console.log(`  Scanned combos: ${learnings.scannedCombos?.length || 0}`);
console.log(`  Skip patterns:  ${learnings.skipPatterns?.length || 0}`);

if (open.length > 0) {
  console.log(`\nOpen issues (next to fix):`);
  for (const issue of open.slice(0, 10)) {
    console.log(`  ${issue.id} — ${issue.diffPct}% (${issue.category})`);
  }
  if (open.length > 10) console.log(`  ... and ${open.length - 10} more`);
}

if (fixAttempted.length > 0) {
  console.log(`\nAwaiting review:`);
  for (const issue of fixAttempted) {
    console.log(`  ${issue.id} — ${issue.diffPct}% (${issue.category})`);
  }
}

if (needsHuman.length > 0) {
  console.log(`\nNeeds human intervention:`);
  for (const issue of needsHuman) {
    const attempts = issue.attempts?.length || 0;
    console.log(`  ${issue.id} — ${issue.diffPct}% after ${attempts} attempts`);
  }
}
