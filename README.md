# WoW Model Viewer

Web-based WoW 1.12.x character model viewer. Renders character models with equipment, animations, and configurable asset sources using Three.js.

## Quick Start

```bash
bun install      # install all workspace deps
bun run dev      # start demo at http://localhost:5173
```

## Scripts

All commands run from the repo root:

| Command | What it does |
|---------|-------------|
| `bun run dev` | Start the demo dev server |
| `bun run build:demo` | Build the demo as a static site |
| `bun run build:lib` | Build the npm package to `packages/viewer/dist/` |
| `bun run typecheck` | Typecheck the viewer package |
| `bun run setup -- ~/Games/TurtleWoW` | Extract game files from a WoW 1.12.x client |
| `bun run extract` | Convert extracted files to web-ready assets |
| `bun run release:patch` | Bump patch version, commit, and tag |
| `bun run release:minor` | Bump minor version, commit, and tag |
| `bun run release:major` | Bump major version, commit, and tag |

## Releasing

1. Make your changes and commit them
2. Run a release command:
   ```bash
   bun run release:patch   # 0.1.0 → 0.1.1
   bun run release:minor   # 0.1.0 → 0.2.0
   bun run release:major   # 0.1.0 → 1.0.0
   ```
3. Push with tags:
   ```bash
   git push && git push --tags
   ```

This triggers two GitHub Actions:
- **Demo deploy** — pushes to main auto-deploys the demo to GitHub Pages
- **npm publish** — the `v*` tag triggers a publish to npm

### GitHub Setup (one-time)

- **Pages**: repo Settings → Pages → Source: **GitHub Actions**
- **npm**: repo Settings → Secrets → Actions → add `NPM_TOKEN` (from `npm token create`)

## Packages

### `packages/viewer` — npm package

`@jollygrin/classic-wow-model-viewer` — the rendering engine.

```bash
npm install @jollygrin/classic-wow-model-viewer three
```

```typescript
import { ModelViewer, createCdnResolver } from '@jollygrin/classic-wow-model-viewer';

const viewer = new ModelViewer({
  container: document.getElementById('viewer')!,
  assets: createCdnResolver('https://cdn.jsdelivr.net/gh/JollyGrin/wow-model-viewer@main/public'),
});

await viewer.loadCharacter('human', 'male');
viewer.playAnimationByName('EmoteDance');

// Equipment
await viewer.equip({
  weapon: { path: '/items/weapon/arcanite-reaper' },
  armor: {
    torsoUpperBase: '/item-textures/TorsoUpperTexture/Plate_A_01Silver_Chest_TU',
    helmet: 'helm-plate-d-02',
    helmetGeosetVisID: [67, 67],
  },
});

// Cleanup
viewer.dispose();
```

**Peer dependency:** `three` >= 0.160.0

### `packages/tools` — Asset extraction CLI

Converts WoW 1.12.x game files into the web-ready assets the viewer consumes.

```bash
bun run setup -- ~/Games/TurtleWoW   # extract from game client
bun run extract                        # convert to web format (~600 MB output)
```

The output lands in `public/` with this structure — upload the whole folder to any static host to use as a CDN:

```
public/
  models/{race}-{gender}/    # model.json, model.bin, anims.bin, textures/
  items/{type}/{slug}/       # weapon, shield, head, shoulder models
  item-textures/{region}/    # armor texture regions
```

### `demo/` — Example apps

- **basic/** — Minimal viewer with race/gender/animation dropdowns
- **chronicle/** — Chronicle API integration (item lookup by ID)

CDN source is configured in `demo/cdn.ts` — change `CDN_BASE` to switch all demos at once.

## Using in Frameworks

The viewer takes a DOM element and has a `dispose()` method — it works with any framework's mount/cleanup lifecycle.

### React
```tsx
import { useRef, useEffect } from 'react';
import { ModelViewer, createCdnResolver } from '@jollygrin/classic-wow-model-viewer';

function WowViewer({ race, gender }: { race: string; gender: 'male' | 'female' }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ModelViewer | null>(null);

  useEffect(() => {
    const viewer = new ModelViewer({
      container: ref.current!,
      assets: createCdnResolver('https://cdn.jsdelivr.net/gh/JollyGrin/wow-model-viewer@main/public'),
    });
    viewerRef.current = viewer;
    return () => viewer.dispose();
  }, []);

  useEffect(() => {
    viewerRef.current?.loadCharacter(race, gender);
  }, [race, gender]);

  return <div ref={ref} style={{ width: '100%', height: '400px' }} />;
}
```

### Svelte
```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import { ModelViewer, createCdnResolver } from '@jollygrin/classic-wow-model-viewer';

  let container;
  let viewer;

  onMount(() => {
    viewer = new ModelViewer({
      container,
      assets: createCdnResolver('https://cdn.jsdelivr.net/gh/JollyGrin/wow-model-viewer@main/public'),
    });
    viewer.loadCharacter('human', 'male');
  });

  onDestroy(() => viewer?.dispose());
</script>

<div bind:this={container} style="width:100%;height:400px"></div>
```

### Vue 3
```vue
<template>
  <div ref="container" style="width:100%;height:400px" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ModelViewer, createCdnResolver } from '@jollygrin/classic-wow-model-viewer';

const container = ref<HTMLDivElement>();
let viewer: ModelViewer;

onMounted(() => {
  viewer = new ModelViewer({
    container: container.value!,
    assets: createCdnResolver('https://cdn.jsdelivr.net/gh/JollyGrin/wow-model-viewer@main/public'),
  });
  viewer.loadCharacter('human', 'male');
});

onUnmounted(() => viewer?.dispose());
</script>
```

### Solid
```tsx
import { onMount, onCleanup } from 'solid-js';
import { ModelViewer, createCdnResolver } from '@jollygrin/classic-wow-model-viewer';

function WowViewer() {
  let container!: HTMLDivElement;
  let viewer: ModelViewer;

  onMount(() => {
    viewer = new ModelViewer({
      container,
      assets: createCdnResolver('https://cdn.jsdelivr.net/gh/JollyGrin/wow-model-viewer@main/public'),
    });
    viewer.loadCharacter('human', 'male');
  });

  onCleanup(() => viewer?.dispose());

  return <div ref={container} style={{ width: '100%', height: '400px' }} />;
}
```

## Architecture

```
┌──────────────────────────────────────────┐
│  Your App                                │
│  - Provides container element            │
│  - Controls viewer via API               │
│  - Brings own item database              │
├──────────────────────────────────────────┤
│  @jollygrin/classic-wow-model-viewer       │
│  - Three.js rendering                    │
│  - Character + equipment loading         │
│  - Texture compositing                   │
│  - Animation system                      │
├──────────────────────────────────────────┤
│  Asset CDN (any static file host)        │
│  - Character models + textures           │
│  - Item models + textures                │
│  - Armor region textures                 │
└──────────────────────────────────────────┘
```

The viewer only handles **asset loading and rendering**. Item database lookups (mapping item IDs to model paths) are the consumer's responsibility. See `demo/chronicle/` for an example.
