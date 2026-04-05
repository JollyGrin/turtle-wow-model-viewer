# Visual Regression Testing

Automated visual comparison of this viewer against WoWHead's ZamImg 3D viewer (source of truth). Catches bugs in asset extraction, format conversion, and rendering across thousands of race × gender × equipment combinations.

## Why

There are 8 classic races × 2 genders × hundreds of equippable items × multiple slots × 2+ camera angles. Manual eyeballing doesn't scale. This suite automates the comparison so we can systematically find and fix rendering discrepancies.

TurtleWoW-exclusive content (blood-elf, goblin, custom items) cannot be compared — ZamImg has no reference for them. Only classic 1.12.x races and items are testable.

## Pipeline Overview

Three decoupled loops communicate via the filesystem (`test-results/`). Each has a single job.

```
SCANNER ──writes issues──▶ FIXER ──marks fix-attempted──▶ REVIEWER
   ▲                                                          │
   │                    ◀── reopens if still broken ───────────┘
   │
   └── skips verified/approved issues on re-scan
```

### Issue Lifecycle

```
open → fix-attempted → verified → human-approved
         ▲                  │
         └── open ──────────┘  (reviewer rejects)
```

After 3 failed fix attempts, an issue escalates to `needs-human` and bypasses the fixer loop.

## The Three Loops

### 1. Scanner

Iterates the test matrix, screenshots both viewers side-by-side, computes pixel diffs, and logs issues.

```bash
bun run test:scan                                              # full matrix
bun run test:scan -- --race=human                              # one race, all combos
bun run test:scan -- --race=orc --gender=male --items=naked    # single combo
```

**What it does per combo:**
1. Loads the test page at `/test/?race=...&gender=...&items=...&angle=...`
2. Waits for both ZamImg and our viewer to finish rendering
3. Screenshots each viewer container independently
4. Runs pixelmatch to compute diff percentage and generate a diff image
5. Runs spatial diagnosis (which body region is affected, what category of bug)
6. If diff exceeds threshold: creates an issue folder in `test-results/issues/`

**What it skips:**
- Issues already at `verified` or `human-approved` status
- Combos matching `skipPatterns` in `learnings.json` (e.g. blood-elf, goblin)
- Combos already scanned in the current run (dedup)

**Output per issue:**
```
test-results/issues/{race}-{gender}-{itemSet}-{angle}/
  zam.png       # ZamImg reference screenshot
  ours.png      # Our viewer screenshot
  diff.png      # Pixel diff visualization (red = different)
  meta.json     # { diffPct, diagnosis, status, params, timestamp }
```

### 2. Fixer

Picks up one open issue, reads prior learnings, diagnoses root cause, attempts a fix, re-runs the single test to verify. Designed to be driven by `claude --dangerously-skip-permissions`.

```bash
bun run test:fix                                               # picks next open issue
bun run test:fix -- --issue=human-male-tier1-warrior-front     # specific issue
```

**Diagnosis categories and where to look:**

| Category | Meaning | Investigation |
|----------|---------|---------------|
| extraction | Model or texture file missing from CDN | `curl -I` the asset URL. If missing, needs re-extraction (can't auto-fix). |
| conversion | File exists but textures/geosets are wrong | Compare texture dimensions, geoset IDs vs Chronicle API response. Fix in `packages/tools/scripts/`. |
| rendering | Geometry offset, wrong attachment, compositing bug | Compare bone positions, geoset visibility, texture compositing. Fix in `packages/viewer/src/`. |
| lighting | Shading/color difference only (structurally correct) | Usually acceptable. Adjust threshold or mark as known-good. |

**Safeguards:**
- Reads `learnings.json` first — won't repeat a known-bad approach
- Max 3 fix attempts per issue before escalating
- Each attempt logged in `meta.json` with approach + result
- Always re-runs the single-test scanner after fixing

### 3. Reviewer

Re-scans fix-attempted issues with a fresh screenshot to verify the fix holds.

```bash
bun run test:review                                            # all fix-attempted issues
bun run test:review -- --issue=human-male-tier1-warrior-front  # specific issue
```

**If diff passes threshold:** status → `verified`, findings added to `learnings.json`, before/after screenshots copied to `test-results/human-review/`.

**If diff still fails:** status → `open` (back to fixer loop). After 3 total attempts: status → `needs-human`.

**Human review queue:**
```
test-results/human-review/{issue-id}/
  summary.md         # What was wrong, what was fixed, confidence
  before-ours.png    # Our screenshot before fix
  after-ours.png     # Our screenshot after fix
  zam.png            # Reference
  diff-before.png    # Diff % before
  diff-after.png     # Diff % after
```

Approve with: `bun run test:approve -- --issue={id}`

## Test Page

The comparison page lives at `demo/test/` and is URL-param driven:

```
/test/?race=human&gender=male&items=16866,16868&angle=front
```

Left panel: ZamImg viewer (reference). Right panel: our viewer. Both render the same model with the same equipment at the same camera angle. Both containers are fixed at 400×600px with matching `#333333` backgrounds.

The page also works for manual debugging — visit it in a browser to eyeball any specific combo.

### ZamImg Integration

ZamImg is loaded from WoWHead's CDN (`wow.zamimg.com/modelviewer/classic/`). It requires jQuery. Items are specified as `[zamSlot, displayId]` pairs — the Chronicle API provides `display_id` which bridges the two systems.

Race mapping: human=1, orc=2, dwarf=3, night-elf=4, scourge=5, tauren=6, gnome=7, troll=8.
Model ID formula: `raceId * 2 - 1 + (male=1, female=0)`.

### Camera Angles

Both viewers use fixed camera positions (no interactive orbit). Animation is paused at frame 0 (Stand pose). Predefined angles:

- **front** — looking at the character's face
- **side** — looking at the character's left side

These need empirical calibration after the first render since the two viewers use different coordinate systems.

## Configuration

### test-matrix.json

Defines what to scan. Start small, expand over time.

```json
{
  "races": ["human","orc","dwarf","night-elf","scourge","tauren","gnome","troll"],
  "genders": ["male","female"],
  "angles": ["front","side"],
  "itemSets": [
    { "id": "naked", "items": [] },
    { "id": "tier1-warrior", "items": [16866,16868,16857,16861,16862,16864,16863] },
    { "id": "ashkandi", "items": [19364] },
    { "id": "drillborer-disk", "items": [19019] }
  ]
}
```

Add new item sets over time as coverage expands. Each item set is identified by `id` — once scanned, the issue folder uses this id, so don't rename.

### thresholds.json

```json
{
  "pass": 15,
  "review": 25,
  "perCategory": { "lighting": 30, "extraction": 5, "rendering": 15 }
}
```

Lighting diffs are expected to be high (different renderers, different shading). Extraction failures should trigger on small diffs (a missing model means a whole blank region). These need calibration after the first naked-model baseline.

### learnings.json

Accumulated findings across all runs. Every loop reads this before starting.

```json
{
  "entries": [
    {
      "id": "orc-male-helmet-offset",
      "category": "rendering",
      "rootCause": "Crown bone behind head center for hunched races",
      "fix": "Mirror offset in convert-model.ts",
      "preventionRule": "Check attachment bones for hunched-posture races"
    }
  ],
  "skipPatterns": [
    { "pattern": "blood-elf-*", "reason": "TurtleWoW-only" },
    { "pattern": "goblin-*", "reason": "TurtleWoW-only" }
  ],
  "scannedCombos": []
}
```

The `scannedCombos` array tracks every combo that has been scanned and passed, so re-runs don't waste time on known-good combinations. Format: `"{race}-{gender}-{itemSet}-{angle}"`. This is the self-logging mechanism that prevents repeating work across sessions.

## Self-Logging: Avoiding Repeated Work

The suite is designed for thousands of iterative runs. Several mechanisms prevent redundant work:

1. **scannedCombos** in `learnings.json` — every passing combo is logged. The scanner skips these on future runs unless `--force` is passed.

2. **Issue status** — the scanner skips combos that already have a `verified` or `human-approved` issue. Only `open` or no-issue combos get re-scanned.

3. **Learnings entries** — the fixer reads all prior entries before attempting a fix. If the same `rootCause` was already resolved, it applies the known fix pattern instead of re-diagnosing from scratch.

4. **Attempt history** — each issue's `meta.json` records every fix attempt with the approach used and the result. The fixer won't try the same approach twice.

5. **API cache** — Chronicle API responses are cached to `test-results/api-cache/`. Items don't change, so this cache is effectively permanent.

### Expanding Coverage

To add new items to the test matrix:

1. Add a new entry to `itemSets` in `test-matrix.json`
2. Run `bun run test:scan -- --items={new-set-id}`
3. Fix any issues found via the fixer loop
4. Review and approve

To scan everything that hasn't been scanned yet:
```bash
bun run test:scan  # automatically skips scannedCombos
```

### Resetting

To force a full re-scan (e.g. after a major renderer change):
```bash
bun run test:scan -- --force   # ignores scannedCombos, re-scans everything
```

To clear all issues and start fresh:
```bash
rm -rf test-results/issues test-results/human-review
# Optionally clear scannedCombos in learnings.json
```

## File Layout

```
demo/test/
  index.html                    # Side-by-side comparison page
  main.ts                       # Dual viewer init, URL params
  zam-bridge.ts                 # Race/slot ID mapping for ZamImg
  camera-presets.ts              # Fixed camera angles
  package.json                   # Scripts + deps (playwright, pixelmatch)
  config/
    test-matrix.json             # What to test
    thresholds.json              # Pass/review/fail percentages
    learnings.json               # Findings + scannedCombos + skipPatterns
  scripts/
    scan.ts                      # Scanner loop
    fix.ts                       # Fixer loop
    review.ts                    # Reviewer loop
    approve.ts                   # Human approval
    status.ts                    # Dashboard
    lib/
      browser.ts                 # Playwright helpers
      pixel-diff.ts              # pixelmatch wrapper
      diagnosis.ts               # Spatial diff analysis
      issue-store.ts             # Issue folder CRUD

test-results/                    # Output (gitignored)
  summary.json
  api-cache/
  issues/{race}-{gender}-{itemSet}-{angle}/
  human-review/{issue-id}/
```

## Running with Claude Code

The fixer loop is designed for `claude --dangerously-skip-permissions`. A typical session:

```bash
# 1. Scan for new issues
claude "Run bun run test:scan and summarize the results"

# 2. Fix issues one at a time
claude --dangerously-skip-permissions "Read learnings.json, then run bun run test:fix to pick the next open issue. Diagnose and fix it. Record your findings."

# 3. Review fixes
claude "Run bun run test:review and show me what needs human approval"

# 4. Repeat
```

Each Claude session should start by reading `docs/regression-testing.md` (this file) and `demo/test/config/learnings.json` for full context.
