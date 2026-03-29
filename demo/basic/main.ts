/**
 * Basic demo — uses the ModelViewer class with a CDN asset source.
 *
 * Change the baseUrl to point at your own CDN, or use '' for local dev
 * (serve public/ with the Vite dev server).
 */
import { ModelViewer, createCdnResolver } from '../../packages/viewer/src/index';
import { CDN_BASE } from '../cdn';

const viewer = new ModelViewer({
  container: document.getElementById('viewer')!,
  assets: createCdnResolver(CDN_BASE),
});

// --- Race / Gender dropdowns ---
const raceSelect = document.getElementById('race-select') as HTMLSelectElement;
const genderSelect = document.getElementById('gender-select') as HTMLSelectElement;
const animSelect = document.getElementById('anim-select') as HTMLSelectElement;

for (const race of ModelViewer.getRaces()) {
  const opt = document.createElement('option');
  opt.value = race.slug;
  opt.textContent = race.label;
  raceSelect.appendChild(opt);
}
raceSelect.value = 'human';

async function switchModel() {
  await viewer.loadCharacter(raceSelect.value, genderSelect.value as 'male' | 'female');

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
