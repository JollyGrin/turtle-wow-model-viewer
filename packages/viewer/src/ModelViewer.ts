import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadModel } from './loadModel';
import { loadAnimations, AnimationController } from './animation';
import type { AssetResolver, EquipmentOptions, AnimationInfo, ModelViewerConfig } from './types';
import type { LoadedModel } from './loadModel';

const RACES = [
  { slug: 'blood-elf', label: 'Blood Elf' },
  { slug: 'dwarf', label: 'Dwarf' },
  { slug: 'gnome', label: 'Gnome' },
  { slug: 'goblin', label: 'Goblin' },
  { slug: 'human', label: 'Human' },
  { slug: 'night-elf', label: 'Night Elf' },
  { slug: 'orc', label: 'Orc' },
  { slug: 'scourge', label: 'Scourge' },
  { slug: 'tauren', label: 'Tauren' },
  { slug: 'troll', label: 'Troll' },
];

export class ModelViewer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private resolver: AssetResolver;
  private canvas: HTMLCanvasElement;

  private currentModel: LoadedModel | null = null;
  private animController: AnimationController | null = null;
  private currentRace: string = '';
  private currentGender: string = '';
  private currentEquipment: EquipmentOptions = {};

  private animFrameId: number = 0;
  private lastFrameTime: number = 0;
  private disposed: boolean = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(config: ModelViewerConfig) {
    this.resolver = config.assets;

    // Create canvas — sized via CSS so it never pushes the container
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    config.container.appendChild(this.canvas);

    // Renderer — updateStyle=false so Three.js doesn't set inline w/h on the canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    const rect = config.container.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height, false);
    this.renderer.setClearColor(config.backgroundColor ?? 0x333333);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 100);
    this.camera.position.set(3, 1, 0);

    // Controls
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 0.9, 0);
    this.controls.update();

    // Lighting — warm-toned to match WoW character panel look
    this.scene.add(new THREE.AmbientLight(0xfff5e6, 0.55));
    const frontLight = new THREE.DirectionalLight(0xfff0dd, 0.75);
    frontLight.position.set(3, 2, 0);
    this.scene.add(frontLight);
    const fillLight = new THREE.DirectionalLight(0xffe8d0, 0.35);
    fillLight.position.set(-2, 1, 0);
    this.scene.add(fillLight);

    // Resize handling
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(config.container);

    // Start render loop
    this.lastFrameTime = performance.now();
    this.animate();
  }

  /** Load a character model. */
  async loadCharacter(race: string, gender: 'male' | 'female'): Promise<void> {
    this.currentRace = race;
    this.currentGender = gender;
    await this.reload();
  }

  /** Equip items. Triggers a full model reload. */
  async equip(equipment: EquipmentOptions): Promise<void> {
    this.currentEquipment = equipment;
    if (this.currentRace) await this.reload();
  }

  /** Clear all equipment. */
  async unequip(): Promise<void> {
    this.currentEquipment = {};
    if (this.currentRace) await this.reload();
  }

  /** Get available animations for the current model. */
  getAnimations(): AnimationInfo[] {
    if (!this.animController) return [];
    return this.animController.getAnimationList();
  }

  /** Play an animation by sequence index. */
  playAnimation(seqIndex: number): void {
    this.animController?.setSequence(seqIndex);
  }

  /** Play an animation by name (e.g. 'Stand', 'Walk', 'EmoteDance'). */
  playAnimationByName(name: string): void {
    if (!this.animController) return;
    const anims = this.animController.getAnimationList();
    const match = anims.find(a => a.label.toLowerCase() === name.toLowerCase());
    if (match) this.animController.setSequence(match.seqIndex);
  }

  /** Get the list of supported races. */
  static getRaces(): Array<{ slug: string; label: string }> {
    return [...RACES];
  }

  /** Clean up all Three.js resources and remove the canvas. */
  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
    if (this.currentModel) this.disposeModel(this.currentModel);
    this.renderer.dispose();
    this.canvas.remove();
  }

  // --- Internal ---

  private async reload(): Promise<void> {
    const slug = `${this.currentRace}-${this.currentGender}`;
    const modelDir = `/models/${slug}`;
    const eq = this.currentEquipment;

    try {
      const [loaded, animData] = await Promise.all([
        loadModel(modelDir, this.resolver, {
          weapon: eq.weapon?.path,
          weaponTexture: eq.weapon?.texture,
          offhand: eq.offhand?.path,
          offhandTexture: eq.offhand?.texture,
          armor: eq.armor,
        }),
        loadAnimations(modelDir, this.resolver),
      ]);

      if (this.currentModel) this.disposeModel(this.currentModel);

      this.scene.add(loaded.group);
      this.currentModel = loaded;

      this.animController = new AnimationController(animData, loaded.boneData, loaded.bones);

      // Default to Stand
      const standIdx = animData.sequences.findIndex((s: { animId: number }) => s.animId === 0);
      if (standIdx >= 0) this.animController.setSequence(standIdx);

      this.frameCameraOnModel(loaded.group);
    } catch (err) {
      throw new Error(`Failed to load model ${slug}`, { cause: err });
    }
  }

  private disposeModel(model: LoadedModel): void {
    model.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) {
          if ((obj.material as any).map) (obj.material as any).map.dispose();
          obj.material.dispose();
        }
      }
    });
    this.scene.remove(model.group);
  }

  private frameCameraOnModel(group: THREE.Group): void {
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    group.position.x = -center.x;
    group.position.z = -center.z;

    const targetY = center.y;
    this.controls.target.set(0, targetY, 0);
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.8;
    this.camera.position.set(dist, targetY, 0);
    this.controls.update();
  }

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height, false);
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animFrameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;

    if (this.animController) this.animController.update(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
