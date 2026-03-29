# classic-wow-model-viewer

Web-based renderer for World of Warcraft 1.12.x (vanilla/classic) character models. Renders characters with equipment, animations, and configurable asset sources using Three.js.

**[Live Demo](https://jollygrin.github.io/turtle-wow-model-viewer/)** | **[GitHub](https://github.com/JollyGrin/turtle-wow-model-viewer)**

## Install

```bash
npm install classic-wow-model-viewer three
```

## Quick Start

```typescript
import { ModelViewer, createCdnResolver } from 'classic-wow-model-viewer';

const viewer = new ModelViewer({
  container: document.getElementById('viewer')!,
  assets: createCdnResolver('https://your-cdn.com'),
});

await viewer.loadCharacter('human', 'male');
viewer.playAnimationByName('EmoteDance');
```

## API

### `ModelViewer`

Turnkey viewer — creates a Three.js scene, camera, controls, lighting, and render loop.

```typescript
const viewer = new ModelViewer({
  container: HTMLElement,       // DOM element to mount into
  assets: AssetResolver,       // Where to fetch model files
  backgroundColor?: number,    // Default: 0x333333
});
```

| Method | Description |
|--------|-------------|
| `loadCharacter(race, gender)` | Load a character model |
| `equip(equipment)` | Equip weapon, offhand, and/or armor |
| `unequip()` | Clear all equipment |
| `getAnimations()` | Get available animation list |
| `playAnimation(seqIndex)` | Play animation by index |
| `playAnimationByName(name)` | Play animation by name (e.g. `'Stand'`, `'Walk'`, `'EmoteDance'`) |
| `dispose()` | Clean up all resources |
| `static getRaces()` | Get list of supported races |

**Supported races:** Blood Elf, Dwarf, Gnome, Goblin, Human, Night Elf, Orc, Scourge, Tauren, Troll

### `createCdnResolver(baseUrl)`

Creates an `AssetResolver` that prepends a base URL to all asset paths.

```typescript
// Remote CDN
createCdnResolver('https://your-cdn.com')

// Local dev server
createCdnResolver('')
```

### Low-level API

For consumers who manage their own Three.js scene:

```typescript
import { loadModel, loadAnimations, AnimationController } from 'classic-wow-model-viewer';

const model = await loadModel('/models/human-male', resolver);
const animData = await loadAnimations('/models/human-male', resolver);
const controller = new AnimationController(animData, model.boneData, model.bones);
```

## Equipment

```typescript
await viewer.equip({
  weapon: { path: '/items/weapon/arcanite-reaper' },
  armor: {
    torsoUpperBase: '/item-textures/TorsoUpperTexture/Plate_A_01Silver_Chest_TU',
    helmet: 'helm-plate-d-02',
    helmetGeosetVisID: [67, 67],
    shoulderSlug: 'leather-blood-b-01',
    shoulderHasRight: true,
    handGeoset: 2,
    footGeoset: 2,
  },
});
```

The viewer handles rendering. Mapping item IDs to asset paths is the consumer's responsibility — see the [Chronicle demo](https://github.com/JollyGrin/turtle-wow-model-viewer/tree/main/demo/chronicle) for an example.

## Asset CDN

The viewer fetches models from a CDN you provide. You can:

1. **Use an existing CDN** — point `createCdnResolver` at any hosted asset set
2. **Host your own** — extract assets from a WoW 1.12.x game client using the [extraction tools](https://github.com/JollyGrin/turtle-wow-model-viewer/tree/main/packages/tools), then upload the `public/` folder to any static host

See the [CDN Pipeline Guide](https://github.com/JollyGrin/turtle-wow-model-viewer/blob/main/docs/cdn-pipeline.md) for full details.

## Framework Integration

The viewer takes a DOM element and has a `dispose()` method — works with any framework.

### React

```tsx
import { useRef, useEffect } from 'react';
import { ModelViewer, createCdnResolver } from 'classic-wow-model-viewer';

function WowViewer({ race, gender }) {
  const ref = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    const v = new ModelViewer({ container: ref.current, assets: createCdnResolver('https://your-cdn.com') });
    viewerRef.current = v;
    return () => v.dispose();
  }, []);

  useEffect(() => { viewerRef.current?.loadCharacter(race, gender); }, [race, gender]);

  return <div ref={ref} style={{ width: '100%', height: '400px' }} />;
}
```

### Svelte / Vue / Solid

See the [framework examples](https://github.com/JollyGrin/turtle-wow-model-viewer/blob/main/README.md#using-in-frameworks) in the repo README.

## License

MIT — see [LICENSE](./LICENSE) for details.

This package is a rendering tool only. It does not include any game assets. All World of Warcraft game data is the intellectual property of Blizzard Entertainment, Inc. This project is not affiliated with or endorsed by Blizzard Entertainment.
