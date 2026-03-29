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
  const race = races[Math.floor(Math.random() * races.length)];
  const gender: 'male' | 'female' = Math.random() > 0.5 ? 'male' : 'female';

  if (raceLabel) {
    raceLabel.textContent = `${race.label}, ${gender[0].toUpperCase()}${gender.slice(1)}`;
  }

  viewer.loadCharacter(race.slug, gender).then(() => {
    const anims = viewer.getAnimations();
    const dance = anims.find(a => a.label === 'EmoteDance');
    if (dance) viewer.playAnimation(dance.seqIndex);
  }).catch(() => {
    if (raceLabel) raceLabel.textContent = 'Human, Male';
    viewer.loadCharacter('human', 'male').catch(() => {});
  });
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
