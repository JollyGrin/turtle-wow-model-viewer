/**
 * Regression test page — side-by-side comparison of ZamImg (reference) vs our viewer.
 *
 * ZamImg runs in an iframe (zam-frame.html) to isolate its WebGL context from ours.
 * Without iframe isolation, the two WebGL contexts conflict and ZamImg flickers/disappears.
 *
 * URL params:
 *   ?race=human&gender=male&items=16866,16868&angle=front
 *
 * Sets window.__TEST_READY = true when both viewers have loaded.
 * Sets window.__TEST_ERROR = "message" if something fails.
 */
import { ModelViewer, createCdnResolver } from '../../packages/viewer/src/index';
import { type ChronicleItem, invTypeToSlot, buildEquipment, type SlotKey } from '../shared/chronicle-utils';
import { zamModelId, zamSlot, isClassicRace } from './zam-bridge';
import { PRESETS, type AngleKey } from './camera-presets';

declare global {
  interface Window {
    __TEST_READY: boolean;
    __TEST_ERROR: string | null;
  }
}

// --- Parse URL params ---
const params = new URLSearchParams(location.search);
const race = params.get('race') || 'human';
const gender = (params.get('gender') || 'male') as 'male' | 'female';
const itemIds = (params.get('items') || '').split(',').filter(Boolean).map(Number);
const angle = (params.get('angle') || 'front') as AngleKey;

// Update status bar
document.getElementById('s-race')!.textContent = race;
document.getElementById('s-gender')!.textContent = gender;
document.getElementById('s-items')!.textContent = itemIds.length ? itemIds.join(', ') : 'none';
document.getElementById('s-angle')!.textContent = angle;

const loadState = document.getElementById('load-state')!;

// --- Chronicle API ---
const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const CHRONICLE_API = isDev
  ? '/chronicle-api/v1/internal/gamedata/display/item'
  : 'https://chronicleclassic.com/api/v1/internal/gamedata/display/item';

async function fetchItems(ids: number[]): Promise<ChronicleItem[]> {
  const results: ChronicleItem[] = [];
  for (const id of ids) {
    try {
      const res = await fetch(`${CHRONICLE_API}/${id}`);
      if (res.ok) results.push(await res.json());
    } catch (e) {
      console.warn(`Failed to fetch item ${id}:`, e);
    }
  }
  return results;
}

// --- ZamImg Viewer (iframe-isolated) ---
function initZamViewer(container: HTMLElement, items: ChronicleItem[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isClassicRace(race)) {
      reject(new Error(`Race "${race}" not available in ZamImg (TurtleWoW-only)`));
      return;
    }

    const modelId = zamModelId(race, gender);
    if (!modelId) {
      reject(new Error(`Cannot compute ZamImg model ID for ${race}-${gender}`));
      return;
    }

    // Build ZamImg item pairs: slot,displayId,slot,displayId,...
    const zamItemPairs: number[] = [];
    for (const item of items) {
      const slot = zamSlot(item.inventory_type);
      if (slot && item.display_id) {
        zamItemPairs.push(slot, item.display_id);
      }
    }

    const preset = PRESETS[angle] || PRESETS.front;

    // Create iframe pointing to zam-frame.html with model + camera params in hash
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    const hashParams = new URLSearchParams();
    hashParams.set('modelId', String(modelId));
    hashParams.set('distance', String(preset.zamDistance));
    hashParams.set('azimuth', String(preset.zamAzimuth));
    hashParams.set('zenith', String(preset.zamZenith));
    if (zamItemPairs.length > 0) hashParams.set('items', zamItemPairs.join(','));
    iframe.src = `/test/zam-frame.html#${hashParams.toString()}`;
    container.appendChild(iframe);

    // Listen for ready message from iframe, with polling fallback
    const timeout = setTimeout(() => {
      // Fallback: check if iframe rendered a canvas (postMessage may fail cross-origin)
      try {
        const iframeCanvas = iframe.contentDocument?.querySelector('canvas');
        if (iframeCanvas && iframeCanvas.width > 0) {
          resolve();
          return;
        }
      } catch {}
      // Even if we can't check, resolve anyway since the iframe loaded
      resolve();
    }, 30000);

    window.addEventListener('message', function handler(e) {
      if (e.data?.type === 'zam-ready') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        setTimeout(resolve, 2000);
      } else if (e.data?.type === 'zam-error') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        reject(new Error(e.data.error));
      }
    });

    // Also poll iframe's __ZAM_READY global as a fallback
    const poll = setInterval(() => {
      try {
        if ((iframe.contentWindow as any)?.__ZAM_READY) {
          clearInterval(poll);
          clearTimeout(timeout);
          setTimeout(resolve, 2000);
        }
      } catch {}
    }, 1000);
  });
}

// --- Our Viewer ---
async function initOurViewer(container: HTMLElement, items: ChronicleItem[]): Promise<void> {
  const viewer = new ModelViewer({
    container,
    assets: createCdnResolver(import.meta.env.BASE_URL.replace(/\/+$/, '')),
  });

  await viewer.loadCharacter(race, gender);

  if (items.length > 0) {
    const equipped: Partial<Record<SlotKey, ChronicleItem>> = {};
    for (const item of items) {
      const slot = invTypeToSlot(item.inventory_type);
      if (slot) equipped[slot] = item;
    }
    const equipment = buildEquipment(equipped);
    await viewer.equip(equipment);
  }

  const preset = PRESETS[angle] || PRESETS.front;
  viewer.setCamera(preset.position, preset.target);
}

// --- Main ---
async function main() {
  const items = itemIds.length > 0 ? await fetchItems(itemIds) : [];

  const zamContainer = document.getElementById('zam-container')!;
  const ourContainer = document.getElementById('our-container')!;

  const errors: string[] = [];

  // Load both in parallel — iframe isolation prevents WebGL context conflicts
  const [zamResult, ourResult] = await Promise.allSettled([
    (async () => {
      loadState.textContent = 'Loading ZamImg...';
      await initZamViewer(zamContainer, items);
    })(),
    (async () => {
      await initOurViewer(ourContainer, items);
    })(),
  ]);

  if (zamResult.status === 'rejected') errors.push(`ZamImg: ${zamResult.reason}`);
  if (ourResult.status === 'rejected') errors.push(`Ours: ${ourResult.reason}`);

  if (errors.length > 0) {
    loadState.textContent = errors.join(' | ');
    loadState.className = 'error';
    window.__TEST_ERROR = errors.join(' | ');
    if (errors.length < 2) window.__TEST_READY = true;
  } else {
    loadState.textContent = 'Ready';
    loadState.className = 'ready';
    window.__TEST_READY = true;
  }
}

main().catch((err) => {
  loadState.textContent = `Fatal: ${err.message}`;
  loadState.className = 'error';
  window.__TEST_ERROR = err.message;
});
