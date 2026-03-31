# WoW Model Tools

CLI scripts that convert raw WoW 1.12.x game files into web-ready assets for the model viewer.

## Prerequisites

- A WoW 1.12.x game client (Turtle WoW, vanilla, Kronos, etc.)
- [Bun](https://bun.sh) runtime

## Quick Start

```bash
bun install

# Step 1: Extract from game client
bun run setup -- /path/to/TurtleWoW

# Step 2: Convert to web format (~600 MB output)
bun run build-assets

# Step 3: Upload to CDN (Cloudflare R2)
export R2_ACCOUNT_ID=your-account-id
export R2_ACCESS_KEY_ID=your-key-id
export R2_SECRET_ACCESS_KEY=your-secret
export R2_BUCKET_NAME=wow-model-viewer
bun run upload
```

## What Each Step Does

### `setup` — Extract Game Data

1. Copies `model.MPQ`, `texture.MPQ`, `patch.MPQ` from client
2. Extracts patch files (`patch.MPQ` through `patch-9.MPQ`)
3. Converts 11 DBC files to JSON

### `build-assets` — 10-Step Pipeline

| # | Script | Output |
|---|--------|--------|
| 1 | extract-mpq-items.ts | Item M2+BLP from MPQs |
| 2 | extract-mpq-textures.ts | Armor region textures from MPQs |
| 3 | extract-char-attachments.ts | Helmet attachment points |
| 4 | convert-model.ts | 20 character models (model.bin + model.json + anims.bin) |
| 5 | convert-textures.ts | Character skin + hair textures |
| 6 | convert-item-textures.ts | Patch armor textures |
| 7 | convert-item.ts | Weapon M2 → web format |
| 8 | convert-head-item.ts | Helmet M2 → web format (per race-gender) |
| 9 | convert-shoulder-item.ts | Shoulder M2 → web format (L/R pairs) |
| 10 | build-item-catalog.ts | Item catalog JSON index |

Output goes to `public/` (~600 MB).

### `upload` — CDN Upload

Uploads `public/` to Cloudflare R2 using the S3-compatible API. Works with any S3-compatible host (AWS S3, MinIO, Backblaze B2, DigitalOcean Spaces).

## Hosting Your Own CDN

Any static file host works. The viewer just needs HTTP access to the asset files.

**Cloudflare R2** (recommended): Free tier covers 10 GB storage + unlimited egress.

**CORS**: If hosting on a different domain, add CORS headers:
```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
```

**Caching**: All game assets are immutable:
```
Cache-Control: public, max-age=31536000, immutable
```

## CDN Asset Structure

```
your-cdn.com/
├── item-catalog.json
├── data/HelmetGeosetVisData.json
├── models/{race}-{gender}/model.{bin,json} + anims.bin + textures/
├── items/{weapon,shield,head,shoulder}/{slug}/
└── item-textures/{Region}/*.tex
```

Point the viewer at your CDN:
```typescript
import { ModelViewer, createCdnResolver } from 'classic-wow-model-viewer';

const viewer = new ModelViewer({
  container: document.getElementById('viewer')!,
  assets: createCdnResolver('https://your-cdn.com'),
});
```
