#!/usr/bin/env bun
/**
 * APPROVE — Mark a verified issue as human-approved.
 *
 * Usage:
 *   bun run scripts/approve.ts --issue=human-male-tier1-warrior-front
 *   bun run scripts/approve.ts --all   # approve all verified issues
 */
import { updateStatus, listIssues } from './lib/issue-store';

const args = process.argv.slice(2);
const argMap: Record<string, string> = {};
for (const arg of args) {
  const [key, val] = arg.replace(/^--/, '').split('=');
  argMap[key] = val ?? 'true';
}

if (argMap['all']) {
  const verified = listIssues('verified');
  if (verified.length === 0) {
    console.log('No verified issues to approve.');
  } else {
    for (const issue of verified) {
      updateStatus(issue.id, 'human-approved');
      console.log(`Approved: ${issue.id}`);
    }
    console.log(`\n${verified.length} issues approved.`);
  }
} else if (argMap['issue']) {
  updateStatus(argMap['issue'], 'human-approved');
  console.log(`Approved: ${argMap['issue']}`);
} else {
  console.log('Usage:');
  console.log('  bun run scripts/approve.ts --issue=<issue-id>');
  console.log('  bun run scripts/approve.ts --all');
}
