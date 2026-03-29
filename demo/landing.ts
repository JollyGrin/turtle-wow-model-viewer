import { ModelViewer, createCdnResolver } from '../packages/viewer/src/index';

// --- Hero model viewer ---
const heroContainer = document.getElementById('hero-viewer');
const raceLabel = document.getElementById('race-label');

if (heroContainer) {
  const viewer = new ModelViewer({
    container: heroContainer,
    assets: createCdnResolver(import.meta.env.BASE_URL.replace(/\/+$/, '')),
    backgroundColor: 0x16140f,
  });

  const races = ModelViewer.getRaces();
  const genders: Array<'male' | 'female'> = ['male', 'female'];

  // Build shuffled playlist of all race-gender combos
  const combos = races.flatMap(r => genders.map(g => ({ race: r, gender: g })));
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }

  let idx = 0;
  let cycling = true;

  async function showModel() {
    const { race, gender } = combos[idx % combos.length];

    if (raceLabel) {
      raceLabel.textContent = `${race.label}, ${gender[0].toUpperCase()}${gender.slice(1)}`;
    }

    try {
      await viewer.loadCharacter(race.slug, gender);
      const anims = viewer.getAnimations();
      const dance = anims.find(a => a.label === 'EmoteDance');
      if (dance) viewer.playAnimation(dance.seqIndex);
    } catch {
      // skip failed models
    }

    idx++;
    if (cycling) setTimeout(showModel, 3000);
  }

  showModel();

  // Stop cycling when user interacts with the viewer
  heroContainer.addEventListener('pointerdown', () => { cycling = false; }, { once: true });
}

// --- Tab switching ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = (btn as HTMLElement).dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');
  });
});
