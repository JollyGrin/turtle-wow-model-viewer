/**
 * Grid page — renders all 16 classic race/gender combos in a 4x4 grid.
 * Used for quick visual regression checks after code changes.
 *
 * URL params:
 *   ?items=16866,16868   — equip these items on all models (optional)
 *
 * Sets window.__GRID_READY = true when all models have loaded.
 */
import { ModelViewer, createCdnResolver } from '../../../packages/viewer/src/index';
import { type ChronicleItem, invTypeToSlot, buildEquipment, type SlotKey } from '../../shared/chronicle-utils';
import { CLASSIC_RACES } from '../zam-bridge';

declare global {
  interface Window {
    __GRID_READY: boolean;
    __GRID_LOADED: number;
    __GRID_TOTAL: number;
  }
}

const GENDERS: Array<'male' | 'female'> = ['male', 'female'];

// Parse items from URL
const params = new URLSearchParams(location.search);
const itemIds = (params.get('items') || '').split(',').filter(Boolean).map(Number);

document.getElementById('s-items')!.textContent = itemIds.length ? itemIds.join(', ') : 'none';

// Chronicle API
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
    } catch (e) { /* skip */ }
  }
  return results;
}

// Build the grid
const grid = document.getElementById('grid')!;
const cells: Array<{ race: string; gender: 'male' | 'female'; container: HTMLElement; label: HTMLElement }> = [];

for (const race of CLASSIC_RACES) {
  for (const gender of GENDERS) {
    const cell = document.createElement('div');
    cell.className = 'cell';

    const label = document.createElement('div');
    label.className = 'cell-label';
    label.textContent = `${race} ${gender}`;

    const container = document.createElement('div');
    container.className = 'cell-viewer';

    cell.appendChild(label);
    cell.appendChild(container);
    grid.appendChild(cell);

    cells.push({ race, gender, container, label });
  }
}

window.__GRID_TOTAL = cells.length;
window.__GRID_LOADED = 0;

const loadedEl = document.getElementById('s-loaded')!;
const loadStateEl = document.getElementById('load-state')!;

async function main() {
  const items = itemIds.length > 0 ? await fetchItems(itemIds) : [];
  const resolver = createCdnResolver(import.meta.env.BASE_URL.replace(/\/+$/, ''));

  // Build equipment once (same for all models)
  let equipmentOpts = undefined as ReturnType<typeof buildEquipment> | undefined;
  if (items.length > 0) {
    const equipped: Partial<Record<SlotKey, ChronicleItem>> = {};
    for (const item of items) {
      const slot = invTypeToSlot(item.inventory_type);
      if (slot) equipped[slot] = item;
    }
    equipmentOpts = buildEquipment(equipped);
  }

  // Load all models (sequentially to avoid overwhelming the browser)
  for (const cell of cells) {
    try {
      const viewer = new ModelViewer({
        container: cell.container,
        assets: resolver,
      });
      await viewer.loadCharacter(cell.race, cell.gender);
      if (equipmentOpts) await viewer.equip(equipmentOpts);
      cell.label.classList.add('loaded');
    } catch (err) {
      console.error(`Failed: ${cell.race}-${cell.gender}`, err);
      cell.label.classList.add('error');
      cell.label.textContent += ' (failed)';
    }

    window.__GRID_LOADED++;
    loadedEl.textContent = String(window.__GRID_LOADED);
  }

  loadStateEl.textContent = 'Ready';
  loadStateEl.style.color = '#4caf50';
  window.__GRID_READY = true;
}

main();
