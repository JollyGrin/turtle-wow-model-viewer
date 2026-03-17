# CLAUDE.md — open-model-viewer

## Project Overview

npm package + tools for rendering WoW 1.12.x character models on the web. Extracted from the model-viewer monolithic app into a clean two-package structure.

## Repository Structure

```
packages/viewer/     # npm package: @anthropic-grins/wow-model-viewer
  src/
    index.ts         # Public API exports
    types.ts         # AssetResolver, BodyArmor, EquipmentOptions, etc.
    ModelViewer.ts   # Turnkey viewer class (scene, camera, controls, render loop)
    loadModel.ts     # Core engine: model loading, skeleton, geosets, equipment (716 lines)
    charTexture.ts   # Texture compositing (134 lines)
    animation.ts     # Animation parsing and playback (406 lines)

packages/tools/      # Asset conversion CLI (not published)
  scripts/           # 14 scripts for extracting + converting WoW game files

demo/                # Example apps (not published)
  basic/             # Minimal viewer with race/gender/animation
  chronicle/         # Chronicle API integration (item lookup by ID)
```

## Key Abstraction: AssetResolver

All fetch calls in the viewer go through `resolver.resolve(path)`. No global state. This replaces the old `setAssetBase()` / `assetUrl()` pattern.

```typescript
const viewer = new ModelViewer({
  container: el,
  assets: createCdnResolver('https://models.chronicleclassic.com'), // or '' for local
});
```

## Development

```bash
# Install deps
cd packages/viewer && bun install
cd demo && bun install

# Run demos
cd demo && bun run dev

# Build library
cd packages/viewer && bun run build
```

## Continuation Checklist

This repo was just created. Next steps:

1. **Install deps and verify builds** — `bun install` in each package
2. **Test demo rendering** — `cd demo && bun run dev`, visit basic/ and chronicle/
3. **Library build** — `cd packages/viewer && bun run build`, verify dist/ output
4. **npm publish** — `npm pack` → test in fresh project
5. **Tests** — port relevant e2e tests from the original repo

## Binary Files

Same rules as the original repo: NEVER read `.m2`, `.blp`, `.skin`, `.dbc`, `.wmo`, `.mpq` files directly. Use `xxd`, `hexdump`, or parsing scripts.

## Asset Formats

- `.tex` — Raw RGBA: uint16 width + uint16 height + pixels
- `model.bin` — Vertex + index buffers (40B/vertex for characters, 32B for items)
- `model.json` — Manifest with bones, geosets, attachments
- `anims.bin` — Animation sequences + keyframes

See `docs/npm-package-plan.md` for full format specs.
