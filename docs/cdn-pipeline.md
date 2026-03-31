# CDN Pipeline: Game Files to Web-Ready Assets

This document explains how the WoW model viewer's asset pipeline works end-to-end — from raw game files on your hard drive to a CDN that the viewer npm package can consume.

## The Big Picture

```
WoW 1.12.x Client          Extraction & Conversion         Any Static Host
┌──────────────┐           ┌──────────────────────┐        ┌───────────────┐
│ Data/         │  setup   │ data/ (intermediate)  │        │ your-cdn.com/ │
│  model.MPQ    │ ──────►  │  model/ (MPQ copies)  │        │  models/      │
│  texture.MPQ  │          │  patch/ (extracted)    │        │  items/       │
│  patch.MPQ    │          │  dbc/   (JSON)         │        │  item-tex...  │
│  patch-2..9   │          │                        │        │  data/        │
└──────────────┘           │ public/ (web-ready)    │        │  item-cat...  │
                  extract  │  models/               │ copy   │               │
                  ──────►  │  items/                │ ────►  │               │
                           │  item-textures/        │        │               │
                           │  data/                 │        │               │
                           │  item-catalog.json     │        │               │
                           └──────────────────────┘        └───────────────┘
```

**Two commands do everything:**

```bash
bun run setup -- ~/Games/TurtleWoW   # Step 1: Extract from game client
bun run extract                       # Step 2: Convert to web format
```

The `public/` folder that comes out is your CDN. Upload it anywhere — GitHub Pages, Cloudflare R2, S3, Vercel, a Raspberry Pi — and the viewer will load assets from it.

## Prerequisites

- **Bun** runtime ([bun.sh](https://bun.sh))
- **WoW 1.12.x game client** — tested with [Turtle WoW](https://turtlecraft.gg), also works with vanilla private servers (Kronos, etc.)
- ~2 GB free disk space for intermediate files, ~600 MB for the final `public/` output

### Required MPQ Files

Your game client's `Data/` folder must contain at minimum:

| File | Contents | Required? |
|------|----------|-----------|
| `model.MPQ` | Character and item 3D models | Yes |
| `texture.MPQ` | Character and item textures | Yes |
| `patch.MPQ` | Base patch overrides | Yes |
| `patch-2.MPQ` through `patch-9.MPQ` | Numbered patches (Turtle WoW specific) | Best effort — uses what exists |
| `dbc.MPQ` or `misc.MPQ` | Database client files | Fallback only |

## Step-by-Step Walkthrough

### Step 1: Setup — Extract from Game Client

```bash
cd packages/tools
bun install
bun run setup -- ~/Games/TurtleWoW
```

This does four things:

1. **Copies base MPQs** — `model.MPQ`, `texture.MPQ`, `patch.MPQ` → `data/model/`
2. **Extracts patch archives** — `patch.MPQ` through `patch-9.MPQ` contents → `data/patch/{patch-name}/`
   - Only extracts `Character/`, `Item/`, and `DBFilesClient/` prefixes (not terrain, sounds, etc.)
   - Higher-numbered patches take priority (patch-9 overrides patch-2)
3. **Converts DBC files** — 11 essential `.dbc` database files → `data/dbc/*.json`
   - ItemDisplayInfo, CharSections, ChrRaces, AnimationData, HelmetGeosetVisData, etc.
4. **Creates output directories** — `public/models/{race}-{gender}/textures/` for all 20 race-gender combos

After this, `data/` looks like:

```
data/
├── model/
│   ├── model.MPQ      (~500 MB)
│   ├── texture.MPQ    (~400 MB)
│   └── patch.MPQ      (~200 MB)
├── patch/
│   ├── patch/         (base patch contents)
│   ├── patch-2/
│   ├── patch-3/       (Item/TextureComponents, Character/ skins)
│   ├── patch-5/       (Character/ skins for some races)
│   ├── patch-6/       (Character/ models for most races)
│   ├── patch-7/       (Goblin models — Turtle WoW addition)
│   ├── patch-8/       (Character/ skins)
│   └── patch-9/       (latest overrides)
│
└── dbc/
    ├── ItemDisplayInfo.json    (item → model/texture mappings)
    ├── CharSections.json       (skin/hair/face variation data)
    ├── AnimationData.json      (animation name lookups)
    ├── HelmetGeosetVisData.json
    └── ... (7 more)
```

### Step 2: Extract & Convert — Build Web Assets

```bash
bun run extract
```

This runs 10 scripts in sequence (typically 5–15 minutes total):

| # | Script | What it does | Output |
|---|--------|-------------|--------|
| 1 | `extract-mpq-items.ts` | Reads item M2 models + BLP textures from `model.MPQ`, `texture.MPQ`, `patch.MPQ` | `public/items/weapon/`, `shield/`, `head/`, `shoulder/` |
| 2 | `extract-mpq-textures.ts` | Reads armor region BLP textures from `texture.MPQ` | `public/item-textures/{Region}/` |
| 3 | `extract-char-attachments.ts` | Parses attachment points (helmet position) from character M2 files | `data/char-attachments.json` |
| 4 | `convert-model.ts` | Converts 20 character M2 models (v256 format) to web binary format | `public/models/{race}-{gender}/model.bin`, `model.json`, `anims.bin` |
| 5 | `convert-textures.ts` | Composites character skin textures (base + face + underwear overlays) | `public/models/{race}-{gender}/textures/skin.tex`, `hair.tex` |
| 6 | `convert-item-textures.ts` | Converts armor region BLPs from patches to `.tex` | `public/item-textures/{Region}/*.tex` |
| 7 | `convert-item.ts` | Converts weapon M2s from patches, extracts all texture color variants | `public/items/weapon/{slug}/` |
| 8 | `convert-head-item.ts` | Converts helmet M2s (one per race-gender variant) | `public/items/head/{slug}/{race-gender}/` |
| 9 | `convert-shoulder-item.ts` | Converts shoulder M2s (left/right pairs) | `public/items/shoulder/{slug}/{left,right}/` |
| 10 | `build-item-catalog.ts` | Builds a master JSON index of all items with available assets | `public/item-catalog.json` |

Steps 1-3 read from MPQ archives (slow, I/O heavy). Steps 4-10 read from the extracted `data/patch/` files (fast). All steps are idempotent — they skip files that already exist.

### The Output: `public/`

After both steps complete, `public/` contains everything the viewer needs:

```
public/                                    (~600 MB total)
├── item-catalog.json                      Master item index
├── data/
│   └── HelmetGeosetVisData.json           Helmet geoset visibility
│
├── models/                                20 race-gender character models
│   ├── human-male/
│   │   ├── model.json                     Manifest (bones, geosets, attachments)
│   │   ├── model.bin                      Vertex buffer (40 bytes/vertex) + index buffer
│   │   ├── anims.bin                      Animation sequences + keyframes
│   │   └── textures/
│   │       ├── skin.tex                   Composited 256×256 body texture
│   │       └── hair.tex                   Hair texture
│   ├── human-female/
│   ├── orc-male/
│   └── ... (17 more)
│
├── items/
│   ├── weapon/{slug}/                     Weapon models
│   │   ├── model.json
│   │   ├── model.bin                      Vertex buffer (32 bytes/vertex) + index buffer
│   │   └── textures/
│   │       ├── {variant-a}.tex            Color variant textures
│   │       └── {variant-b}.tex
│   ├── shield/{slug}/                     Shield models (same format as weapons)
│   ├── head/{helm-slug}/                  Helmet models
│   │   ├── human-male/                    Race-gender specific geometry
│   │   │   ├── model.json
│   │   │   └── model.bin
│   │   ├── orc-female/
│   │   ├── ... (up to 20 variants)
│   │   └── textures/
│   │       └── main.tex                   Shared across all race variants
│   └── shoulder/{slug}/                   Shoulder models
│       ├── left/
│       │   ├── model.json
│       │   └── model.bin
│       ├── right/                         (optional — some shoulders are symmetric)
│       └── textures/
│           └── main.tex
│
└── item-textures/                         Armor body region textures
    ├── ArmUpperTexture/
    │   ├── {name}_M.tex                   Male variant
    │   ├── {name}_F.tex                   Female variant
    │   └── {name}_U.tex                   Unisex
    ├── ArmLowerTexture/
    ├── HandTexture/
    ├── TorsoUpperTexture/
    ├── TorsoLowerTexture/
    ├── LegUpperTexture/
    ├── LegLowerTexture/
    └── FootTexture/
```

## Binary Formats

### `.tex` — Raw RGBA texture

```
Bytes 0-1:   uint16 LE  width
Bytes 2-3:   uint16 LE  height
Bytes 4+:    uint8[]    RGBA pixel data (width × height × 4 bytes)
```

### `model.bin` — Vertex + index buffer

**Character models** (40 bytes/vertex):
```
position    3×float32   12B   offset 0
normal      3×float32   12B   offset 12
uv          2×float32    8B   offset 24
boneIndex   4×uint8      4B   offset 32
boneWeight  4×uint8      4B   offset 36
```

**Item models** (32 bytes/vertex — no skinning):
```
position    3×float32   12B   offset 0
normal      3×float32   12B   offset 12
uv          2×float32    8B   offset 24
```

Index buffer follows immediately after vertex buffer (uint16 indices).

### `model.json` — Manifest

```json
{
  "vertexCount": 1234,
  "indexCount": 5678,
  "triangleCount": 1892,
  "vertexBufferSize": 49360,
  "indexBufferSize": 11356,
  "vertexStride": 40,
  "bones": [{ "parent": -1, "pivot": [0, 0, 0], "rotation": [0, 0, 0, 1], "translation": [0, 0, 0] }],
  "groups": [{ "id": 0, "indexStart": 0, "indexCount": 300, "textureType": 1 }],
  "attachments": [{ "id": 1, "bone": 42, "pos": [0.1, 0.2, 0.3] }]
}
```

### `anims.bin` — Animation data

Binary format with magic `"ANIM"`, containing sequence metadata, bone tracks, and keyframe data. See `packages/viewer/src/animation.ts` for the parser.

## CDN URL Contract

The viewer fetches assets using these URL patterns. Your CDN must serve files at exactly these paths:

```
{CDN_BASE}/models/{race}-{gender}/model.json
{CDN_BASE}/models/{race}-{gender}/model.bin
{CDN_BASE}/models/{race}-{gender}/anims.bin
{CDN_BASE}/models/{race}-{gender}/textures/skin.tex
{CDN_BASE}/models/{race}-{gender}/textures/hair.tex
{CDN_BASE}/data/HelmetGeosetVisData.json

{CDN_BASE}/items/weapon/{slug}/model.json
{CDN_BASE}/items/weapon/{slug}/model.bin
{CDN_BASE}/items/weapon/{slug}/textures/{variant}.tex

{CDN_BASE}/items/shield/{slug}/model.json
{CDN_BASE}/items/shield/{slug}/model.bin
{CDN_BASE}/items/shield/{slug}/textures/{variant}.tex

{CDN_BASE}/items/head/{slug}/{race}-{gender}/model.json
{CDN_BASE}/items/head/{slug}/{race}-{gender}/model.bin
{CDN_BASE}/items/head/{slug}/textures/{texture}.tex

{CDN_BASE}/items/shoulder/{slug}/left/model.json
{CDN_BASE}/items/shoulder/{slug}/left/model.bin
{CDN_BASE}/items/shoulder/{slug}/right/model.json     (optional)
{CDN_BASE}/items/shoulder/{slug}/right/model.bin       (optional)
{CDN_BASE}/items/shoulder/{slug}/textures/{texture}.tex

{CDN_BASE}/item-textures/{Region}/{name}_{M|F|U}.tex
```

**Race slugs:** `blood-elf`, `dwarf`, `gnome`, `goblin`, `human`, `night-elf`, `orc`, `scourge`, `tauren`, `troll`
**Genders:** `male`, `female`
**Texture regions:** `ArmUpperTexture`, `ArmLowerTexture`, `HandTexture`, `TorsoUpperTexture`, `TorsoLowerTexture`, `LegUpperTexture`, `LegLowerTexture`, `FootTexture`

## Hosting Options

The `public/` folder is the CDN. Upload it anywhere that serves static files:

### Option 1: GitHub (free, easiest)

Push `public/` to a GitHub repo. Use jsDelivr as a free CDN:

```
https://cdn.jsdelivr.net/gh/{user}/{repo}@{branch}/public
```

Pros: Free, automatic CORS, global CDN, version pinning via git tags.
Cons: 50 MB per-file limit (all assets are well under this), rate limits on very high traffic.

### Option 2: Cloudflare R2 (free tier, production-grade)

```bash
export R2_ACCOUNT_ID=your-id
export R2_ACCESS_KEY_ID=your-key
export R2_SECRET_ACCESS_KEY=your-secret
export R2_BUCKET_NAME=wow-models
bun run upload        # runs upload-to-r2.ts
```

Then add a custom domain or use the R2.dev URL. Add CORS rules in the R2 dashboard:

```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
```

Pros: Free 10 GB storage, zero egress fees, fast globally.
Cons: Requires Cloudflare account, needs CORS configuration.

### Option 3: Any S3-compatible host

The `upload-to-r2.ts` script uses the standard S3 API. Change the endpoint to target AWS S3, Backblaze B2, DigitalOcean Spaces, MinIO, etc.

### Option 4: Any static web server

Just copy `public/` to your web root:

```bash
rsync -av public/ user@server:/var/www/wow-models/
# or
aws s3 sync public/ s3://your-bucket/
# or
scp -r public/ user@server:~/www/
```

### CORS

If the CDN is on a different domain than your app, the server must send:

```
Access-Control-Allow-Origin: *
```

GitHub/jsDelivr does this automatically. For R2/S3, configure a CORS policy.

### Caching

All game assets are immutable — safe to cache forever:

```
Cache-Control: public, max-age=31536000, immutable
```

## Using Your CDN

```typescript
import { ModelViewer, createCdnResolver } from 'classic-wow-model-viewer';

const viewer = new ModelViewer({
  container: document.getElementById('viewer')!,
  assets: createCdnResolver('https://your-cdn.com'),
});

await viewer.loadCharacter('human', 'male');
```

## Known Limitations & Improvement Areas

### Current pain points

1. **Patch-directory hardcoding** — Some conversion scripts (convert-textures.ts, convert-model.ts) have hardcoded patch directory names like `patch-6` or `patch-3` for specific races. If your client has a different patch layout, some models may fail to convert. Fix: scan all patch directories and use highest-priority match.

2. **DBC JSON format** — The setup script writes 14 lines of log text before the JSON array in each DBC file. All downstream scripts read line 15 for the actual data. This is fragile and should be replaced with pure JSON files.

3. **No incremental updates** — The pipeline is all-or-nothing. If you add a new item model, you must re-run the full `extract` step (though each sub-step skips existing files).

4. **Turtle WoW specific** — The 20-race list includes Goblin (a Turtle WoW addition, not in original vanilla). Race lists are hardcoded in multiple scripts. Other 1.12.x servers with different custom races would need script modifications.

5. **No validation step** — There's no script that checks whether the output is complete and correct (e.g., every race has all 3 model files, every weapon has at least one texture).

6. **upload-to-r2.ts only** — The upload script is Cloudflare R2 specific. For other hosts, users must upload manually or adapt the script.

### Future improvements

- [ ] Validation script that checks `public/` completeness
- [ ] Auto-detect patch directories instead of hardcoding
- [ ] Clean DBC JSON format (drop the log header hack)
- [ ] Support for other 1.12.x clients with different patch structures
- [ ] GitHub Actions workflow to run extraction in CI (given MPQ files as artifacts)
- [ ] Progress bars and better error messages during extraction
- [ ] Dry-run mode that shows what would be extracted without writing files
