/**
 * Issue folder CRUD — read/write issue directories in test-results/issues/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const RESULTS_DIR = resolve(import.meta.dirname, '../../../../test-results');
const ISSUES_DIR = join(RESULTS_DIR, 'issues');
const REVIEW_DIR = join(RESULTS_DIR, 'human-review');

export type IssueStatus = 'open' | 'fix-attempted' | 'verified' | 'human-approved' | 'needs-human';

export interface IssueMeta {
  id: string;
  race: string;
  gender: string;
  itemSet: string;
  angle: string;
  diffPct: number;
  category: string;
  status: IssueStatus;
  timestamp: string;
  attempts?: Array<{
    attempt: number;
    approach: string;
    result: string;
    diffBefore: number;
    diffAfter: number;
  }>;
  regressionGuard?: {
    ran: boolean;
    passed: boolean;
    samplesChecked: number;
    regressions: Array<{
      combo: string;
      diffBefore: number;
      diffAfter: number;
      note: string;
    }>;
  };
  fix?: string;
}

export function ensureDirs() {
  mkdirSync(ISSUES_DIR, { recursive: true });
  mkdirSync(REVIEW_DIR, { recursive: true });
  mkdirSync(join(RESULTS_DIR, 'api-cache'), { recursive: true });
}

export function issueDir(id: string): string {
  return join(ISSUES_DIR, id);
}

export function reviewDir(id: string): string {
  return join(REVIEW_DIR, id);
}

export function issueExists(id: string): boolean {
  return existsSync(join(issueDir(id), 'meta.json'));
}

export function readMeta(id: string): IssueMeta | null {
  const path = join(issueDir(id), 'meta.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function writeMeta(id: string, meta: IssueMeta): void {
  const dir = issueDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
}

export function updateStatus(id: string, status: IssueStatus, extra?: Partial<IssueMeta>): void {
  const meta = readMeta(id);
  if (!meta) throw new Error(`Issue not found: ${id}`);
  meta.status = status;
  if (extra) Object.assign(meta, extra);
  writeMeta(id, meta);
}

export function listIssues(status?: IssueStatus): IssueMeta[] {
  if (!existsSync(ISSUES_DIR)) return [];
  const dirs = readdirSync(ISSUES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const issues: IssueMeta[] = [];
  for (const dir of dirs) {
    const meta = readMeta(dir);
    if (meta && (!status || meta.status === status)) {
      issues.push(meta);
    }
  }
  return issues;
}

export function comboId(race: string, gender: string, itemSet: string, angle: string): string {
  return `${race}-${gender}-${itemSet}-${angle}`;
}

/** Save a PNG buffer to an issue directory. */
export function saveImage(id: string, filename: string, buffer: Buffer): void {
  const dir = issueDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), buffer);
}

/** Save a PNG buffer to the human-review directory. */
export function saveReviewImage(id: string, filename: string, buffer: Buffer): void {
  const dir = reviewDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), buffer);
}

export function writeReviewSummary(id: string, content: string): void {
  const dir = reviewDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'summary.md'), content);
}

export { RESULTS_DIR, ISSUES_DIR, REVIEW_DIR };
