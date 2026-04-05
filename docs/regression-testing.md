# Visual Regression Testing

Automated visual comparison of this viewer against WoWHead's ZamImg 3D viewer (source of truth). Catches bugs in asset extraction, format conversion, and rendering across thousands of race × gender × equipment combinations.

## Why

There are 8 classic races × 2 genders × hundreds of equippable items × multiple slots × 2+ camera angles. Manual eyeballing doesn't scale. This suite automates the comparison so we can systematically find and fix rendering discrepancies.

TurtleWoW-exclusive content (blood-elf, goblin, custom items) cannot be compared — ZamImg has no reference for them. Only classic 1.12.x races and items are testable.

## Prerequisites: Local Asset Pipeline

Tests run against **local** assets, not the CDN. This is critical because the fixer loop may need to modify extraction or conversion scripts and regenerate assets to test a fix.

### Setup (one-time)

```bash
cd packages/tools
bun install

# Point at your WoW 1.12.x client (copies MPQs + DBCs to data/)
bun run setup -- ~/Games/TurtleWoW
```

This populates `packages/tools/data/` with:
- `data/model/model.MPQ`, `texture.MPQ`, `patch.MPQ` — raw game archives
- `data/dbc/ItemDisplayInfo.json`, `CharSections.json` — database tables

### Build assets (after setup or after any extraction/conversion fix)

```bash
cd packages/tools
bun run build-assets
```

This runs a 10-step pipeline, in order:

| Step | Script | Output |
|------|--------|--------|
| 1 | `extract-mpq-items.ts` | M2+BLP from MPQs → `public/items/` |
| 2 | `extract-mpq-textures.ts` | BLP from MPQs → `public/item-textures/` |
| 3 | `extract-char-attachments.ts` | Attachment points → `data/char-attachments.json` |
| 4 | `convert-model.ts` | Character M2s → `public/models/` (20 race/gender combos) |
| 5 | `convert-textures.ts` | Character BLPs → skin + hair `.tex` files |
| 6 | `convert-item-textures.ts` | Patch BLPs → `public/item-textures/` |
| 7 | `convert-item.ts` | Patch M2+BLP → `public/items/weapon/` |
| 8 | `convert-head-item.ts` | Helmet M2+BLP → `public/items/head/` |
| 9 | `convert-shoulder-item.ts` | Shoulder M2+BLP → `public/items/shoulder/` |
| 10 | `build-item-catalog.ts` | Index → `public/item-catalog.json` |

After this, `packages/tools/public/` contains all web-ready assets. The demo's Vite dev server serves these from `demo/public/` (symlinked or copied).

### When to rebuild

- **After modifying any script in `packages/tools/scripts/`** — re-run `bun run build-assets` (or just the affected step)
- **After the fixer loop changes a conversion script** — rebuild affected assets, then re-scan
- **Targeted rebuild** — run individual scripts for faster iteration:
  ```bash
  bun run scripts/convert-model.ts          # just character models
  bun run scripts/convert-item.ts           # just weapons
  bun run scripts/convert-head-item.ts      # just helmets
  ```

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
- Combos already in `scannedCombos` (unless `--force`)

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

**Diagnosis categories and where to fix:**

| Category | Meaning | Where to fix | Rebuild needed |
|----------|---------|--------------|----------------|
| extraction | Model/texture missing from local assets | `packages/tools/scripts/extract-*.ts` | Yes — re-run `bun run build-assets` |
| conversion | File exists but textures/geosets wrong | `packages/tools/scripts/convert-*.ts` | Yes — re-run affected convert script |
| rendering | Geometry offset, attachment bug, compositing | `packages/viewer/src/loadModel.ts`, `charTexture.ts` | No — viewer reloads live |
| lighting | Shading/color difference (structurally correct) | Usually acceptable — adjust threshold | No |

**Fixer workflow for extraction/conversion fixes:**
1. Identify the root cause in the conversion script
2. Modify the script (e.g. `convert-model.ts`, `convert-head-item.ts`)
3. Re-run the specific script: `cd packages/tools && bun run scripts/convert-model.ts`
4. Re-run the single-test scan to check if the diff improved
5. **Run regression guard** (see below) to make sure nothing else broke

**Safeguards:**
- Reads `learnings.json` first — won't repeat a known-bad approach
- Max 3 fix attempts per issue before escalating
- Each attempt logged in `meta.json` with approach + result
- Always re-runs the single-test scanner after fixing
- Always runs regression guard after fixing

### 3. Reviewer

Re-scans fix-attempted issues with a fresh screenshot to verify the fix holds. **Also runs the regression guard** to check that the fix didn't break previously-passing combos.

```bash
bun run test:review                                            # all fix-attempted issues
bun run test:review -- --issue=human-male-tier1-warrior-front  # specific issue
```

**If diff passes threshold AND regression guard passes:** status → `verified`, findings added to `learnings.json`, before/after screenshots copied to `test-results/human-review/`.

**If diff still fails OR regression guard fails:** status → `open` (back to fixer loop). After 3 total attempts: status → `needs-human`.

**Human review queue:**
```
test-results/human-review/{issue-id}/
  summary.md         # What was wrong, what was fixed, confidence
  before-ours.png    # Our screenshot before fix
  after-ours.png     # Our screenshot after fix
  zam.png            # Reference
  diff-before.png    # Diff % before
  diff-after.png     # Diff % after
  regression.md      # Regression guard results
```

Approve with: `bun run test:approve -- --issue={id}`

## Regression Guard

**The most important safety mechanism.** Changes to extraction/conversion scripts affect ALL models and items — a fix for orc helmets can break human shoulders. The regression guard catches this.

### How it works

After every fix attempt, the guard:

1. **Loads the grid page** (`/test/grid/`) — shows ALL 16 race/gender combos on one screen, naked (no equipment). This is a quick visual sanity check that no base model is broken.

2. **Random samples from scannedCombos** — picks N previously-passing combos (default: 10, configurable) and re-scans them. If any now fail, the fix is flagged as a regression.

3. **Category-aware sampling** — if the fix was in a conversion script (e.g. `convert-head-item.ts`), the guard preferentially samples other combos that use helmets across different races. Fixes in the renderer (`loadModel.ts`) trigger broader sampling.

### Grid page (`demo/test/grid/`)

A single page that renders all 16 classic race/gender combos simultaneously in a 4×4 grid. Each cell is a small (200×300px) instance of our viewer. No ZamImg comparison — this is purely for spotting obvious regressions at a glance (missing models, broken textures, wrong poses).

```
/test/grid/                           # naked base models
/test/grid/?items=16866               # all 16 combos with Helm of Might
```

This page is useful for:
- Quick visual check after any code change
- Screenshot by the regression guard for the review queue
- Manual browsing during development

### Sampling strategy

```json
{
  "regressionGuard": {
    "sampleCount": 10,
    "strategy": "category-weighted",
    "weights": {
      "same-slot": 4,
      "same-race": 3,
      "random": 3
    }
  }
}
```

If fixing a helmet issue on orc-male:
- 4 samples: other races with helmets (same slot)
- 3 samples: orc-male with other gear (same race)
- 3 samples: random from scannedCombos

If fixing something in the base renderer (`loadModel.ts`):
- All 10 samples random (any change could affect anything)

### Regression guard output

Added to the issue's `meta.json`:
```json
{
  "regressionGuard": {
    "ran": true,
    "passed": false,
    "samplesChecked": 10,
    "regressions": [
      {
        "combo": "dwarf-female-tier1-warrior-front",
        "diffBefore": 8.2,
        "diffAfter": 31.5,
        "note": "Shoulder geoset now missing"
      }
    ]
  }
}
```

If regressions are found, the fixer must address them before the fix can proceed.

## Test Page

The comparison page lives at `demo/test/` and is URL-param driven:

```
/test/?race=human&gender=male&items=16866,16868&angle=front
```

Left panel: ZamImg viewer (reference). Right panel: our viewer. Both render the same model with the same equipment at the same camera angle. Both containers are fixed at 400×600px with matching `#333333` backgrounds.

The page also works for manual debugging — visit it in a browser to eyeball any specific combo.

### ZamImg Integration

ZamImg runs in an **iframe** (`zam-frame.html`) to isolate its WebGL context from our Three.js viewer. Without isolation, the two contexts conflict and ZamImg's model flickers and disappears.

**Vite proxy** at `/zamimg-proxy/` → `wow.zamimg.com` is required. WoWHead's CDN does not serve model data to arbitrary origins. Configured in `demo/vite.config.ts`.

**Important: use the deployment viewer, not the root viewer.** WoWHead migrated from `.mo3` to `.m2` model files. The old `viewer/viewer.min.js` references `.mo3` which no longer exists. The current working viewer is at:
```
/zamimg-proxy/modelviewer/classic/deployment/viewer/c3f890f/viewer.min.js
```
This deployment hash (`c3f890f`) may change. If ZamImg stops loading models, check `https://www.wowhead.com/classic/dressing-room` network tab for the current hash.

**WH global stubs** are required — ZamImg expects a `window.WH` namespace with `WebP.getImageExtension()`, inventory type constants, and debug functions. Defined in `demo/test/zam-frame.html`. Ported from `.trees/feature-custom-wow-zamimg/`.

**Gender mapping:** WoW uses Gender 0 = male, Gender 1 = female. Model ID formula: `raceId * 2 - 1 + genderNum` where `genderNum = 0` for male, `1` for female.

**ZamModelViewer constructor** returns a promise — must be `await`ed. After the model loads, camera settings must be applied repeatedly (with setTimeout) because ZamImg's internal framing overrides them during initial render.

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
      "filesChanged": ["packages/tools/scripts/convert-model.ts"],
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

3. **Learnings entries** — the fixer reads all prior entries before attempting a fix. If the same `rootCause` was already resolved, it applies the known fix pattern instead of re-diagnosing from scratch. Each entry includes `filesChanged` so the fixer knows which scripts were involved.

4. **Attempt history** — each issue's `meta.json` records every fix attempt with the approach used and the result. The fixer won't try the same approach twice.

5. **API cache** — Chronicle API responses are cached to `test-results/api-cache/`. Items don't change, so this cache is effectively permanent.

6. **Regression guard history** — previously-passing combos in `scannedCombos` serve as the regression guard's sampling pool. The pool grows with every successful scan, making the guard more thorough over time.

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

## Fixer Loop: Full Workflow

Since the fixer may need to touch extraction, conversion, OR rendering code, here's the complete decision tree:

```
Read learnings.json
Read issue meta.json (diagnosis category)
│
├── extraction issue
│   ├── Check: does the file exist locally in packages/tools/public/?
│   ├── If missing: fix the extract script, re-run it
│   ├── If present but wrong: downgrade to conversion
│   └── Rebuild: bun run scripts/extract-mpq-items.ts (or relevant extract script)
│
├── conversion issue
│   ├── Identify which convert script produced the bad asset
│   ├── Fix the script (convert-model.ts, convert-item.ts, convert-head-item.ts, etc.)
│   ├── Rebuild: bun run scripts/{affected-convert-script}.ts
│   ├── Re-scan the single test combo
│   └── Run regression guard (conversion fixes are HIGH RISK for regressions)
│
├── rendering issue
│   ├── Fix in packages/viewer/src/ (loadModel.ts, charTexture.ts, animation.ts)
│   ├── No rebuild needed — Vite hot-reloads
│   ├── Re-scan the single test combo
│   └── Run regression guard (renderer fixes are HIGHEST RISK)
│
└── lighting issue
    └── Usually: adjust threshold or mark as known-acceptable
```

**Risk levels for regression:**
- Extract script change → Medium risk (only affects extracted assets for that category)
- Convert script change → High risk (affects all models/items processed by that script)
- Renderer change → Highest risk (affects ALL rendering)

The regression guard's sample count scales with risk: 5 for extraction, 10 for conversion, 15+ for renderer changes.

## File Layout

```
demo/test/
  index.html                    # Side-by-side comparison page
  main.ts                       # Dual viewer init, URL params
  zam-bridge.ts                 # Race/slot ID mapping for ZamImg
  camera-presets.ts              # Fixed camera angles
  package.json                   # Scripts + deps (playwright, pixelmatch)
  grid/
    index.html                   # 4x4 grid of all 16 race/gender combos
    main.ts                      # Grid page logic
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
      regression-guard.ts        # Regression sampling + grid check

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

# 2. Fix issues one at a time (may modify extraction/conversion/rendering code)
claude --dangerously-skip-permissions "Read docs/regression-testing.md and learnings.json, then run bun run test:fix. Diagnose and fix the issue. If you change a conversion script, rebuild assets with the appropriate script in packages/tools/scripts/. Run the regression guard after fixing. Record findings in learnings.json."

# 3. Review fixes
claude "Run bun run test:review and show me what needs human approval"

# 4. Repeat
```

Each Claude session should start by reading:
1. `docs/regression-testing.md` (this file) — for the full workflow
2. `demo/test/config/learnings.json` — for prior findings and scannedCombos
3. `docs/learnings.md` — for deeper context on past rendering fixes
