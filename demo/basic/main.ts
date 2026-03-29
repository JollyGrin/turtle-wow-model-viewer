/**
 * Basic demo — uses the ModelViewer class with a CDN asset source.
 *
 * Change the baseUrl to point at your own CDN, or use '' for local dev
 * (serve public/ with the Vite dev server).
 */
import { ModelViewer, createCdnResolver } from '../../packages/viewer/src/index';

// Serve models from demo/public/ — Vite's BASE_URL handles GitHub Pages prefix
const viewer = new ModelViewer({
  container: document.getElementById('viewer')!,
  assets: createCdnResolver(import.meta.env.BASE_URL.replace(/\/+$/, '')),
});

// --- Race / Gender dropdowns ---
const raceSelect = document.getElementById('race-select') as HTMLSelectElement;
const genderSelect = document.getElementById('gender-select') as HTMLSelectElement;
const animSelect = document.getElementById('anim-select') as HTMLSelectElement;
const errorEl = document.getElementById('error')!;

for (const race of ModelViewer.getRaces()) {
  const opt = document.createElement('option');
  opt.value = race.slug;
  opt.textContent = race.label;
  raceSelect.appendChild(opt);
}
raceSelect.value = 'human';

async function switchModel() {
  errorEl.style.display = 'none';
  try {
    await viewer.loadCharacter(raceSelect.value, genderSelect.value as 'male' | 'female');
  } catch (err) {
    errorEl.textContent = `Failed to load ${raceSelect.value}-${genderSelect.value}`;
    errorEl.style.display = 'block';
    console.error(err);
    return;
  }

  // Populate animation dropdown
  animSelect.innerHTML = '';
  const seen = new Set<number>();
  for (const anim of viewer.getAnimations()) {
    if (anim.duration === 0) continue;
    if (anim.subAnimId > 0 && seen.has(anim.animId)) continue;
    seen.add(anim.animId);
    const opt = document.createElement('option');
    opt.value = String(anim.seqIndex);
    opt.textContent = anim.label;
    animSelect.appendChild(opt);
  }
}

raceSelect.addEventListener('change', switchModel);
genderSelect.addEventListener('change', switchModel);
animSelect.addEventListener('change', () => {
  viewer.playAnimation(parseInt(animSelect.value, 10));
});

switchModel();
