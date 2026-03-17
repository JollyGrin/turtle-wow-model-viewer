// Types
export type {
  AssetResolver,
  CdnResolverOptions,
  EquipmentOptions,
  AnimationInfo,
  ModelViewerConfig,
  BodyArmor,
  BoneInfo,
  LoadedModel,
} from './types';

// Resolver factory
export { createCdnResolver } from './types';

// Turnkey viewer
export { ModelViewer } from './ModelViewer';

// Low-level API (for consumers who manage their own Three.js scene)
export { loadModel } from './loadModel';
export { loadAnimations, AnimationController } from './animation';
export { composeCharTexture, loadTexImageData, CharRegion } from './charTexture';
