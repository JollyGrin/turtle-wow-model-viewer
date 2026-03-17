# WoW Model Viewer

Web-based WoW 1.12.x character model viewer. Renders character models with equipment, animations, and configurable asset sources using Three.js.

## Packages

### `packages/viewer` — npm package (`@anthropic-grins/wow-model-viewer`)

The rendering engine. Accepts a CDN URL and renders characters with equipment.

```typescript
import { ModelViewer, createCdnResolver } from '@anthropic-grins/wow-model-viewer';

const viewer = new ModelViewer({
  container: document.getElementById('viewer')!,
  assets: createCdnResolver('https://models.chronicleclassic.com'),
});

await viewer.loadCharacter('human', 'male');

// Equip items (consumer resolves item IDs to asset paths)
await viewer.equip({
  weapon: { path: '/items/weapon/arcanite-reaper' },
  armor: {
    torsoUpperBase: '/item-textures/TorsoUpperTexture/Plate_A_01Silver_Chest_TU',
    helmet: 'helm-plate-d-02',
    helmetGeosetVisID: [67, 67],
  },
});

// Animation
viewer.playAnimationByName('EmoteDance');

// Cleanup
viewer.dispose();
```

**Peer dependency:** `three` >= 0.160.0

### `packages/tools` — Asset conversion CLI

Scripts that convert raw WoW game files into the web-ready assets the viewer consumes. See [packages/tools/README.md](packages/tools/README.md).

```bash
cd packages/tools && bun install
bun run setup -- /path/to/TurtleWoW    # extract from game client
bun run build-assets                     # convert to web format (~600 MB)
bun run upload                           # upload to Cloudflare R2
```

### `demo/` — Example apps

- `demo/basic/` — Minimal viewer with race/gender/animation dropdowns
- `demo/chronicle/` — Chronicle API integration (item lookup by ID)

```bash
cd demo && bun install && bun run dev
```

## Architecture

```
┌──────────────────────────────────────────┐
│  Your App                                │
│  - Provides container element            │
│  - Controls viewer via API               │
│  - Brings own item database              │
├──────────────────────────────────────────┤
│  @anthropic-grins/wow-model-viewer       │
│  - Three.js rendering                    │
│  - Character + equipment loading         │
│  - Texture compositing                   │
│  - Animation system                      │
├──────────────────────────────────────────┤
│  Asset CDN (or local dev server)         │
│  - Character models + textures           │
│  - Item models + textures                │
│  - Armor region textures                 │
└──────────────────────────────────────────┘
```

The viewer only handles **asset loading and rendering**. Item database lookups (mapping item IDs to model paths) are the consumer's responsibility. See `demo/chronicle/` for an example.

## Status

Work in progress. See [docs/npm-package-plan.md](docs/npm-package-plan.md) for the full implementation plan.

### What's done
- [x] Core engine extracted (loadModel, charTexture, animation)
- [x] AssetResolver abstraction (replaces global mutable state)
- [x] ModelViewer turnkey class
- [x] Basic + Chronicle demos
- [x] Tools package with all 14 conversion scripts

### What's next
- [ ] Vite library build + npm publish
- [ ] TypeScript declarations
- [ ] Install deps and verify demos render
- [ ] Tests
