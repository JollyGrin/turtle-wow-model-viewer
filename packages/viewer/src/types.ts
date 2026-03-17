import type { BodyArmor, LoadedModel, BoneInfo } from './loadModel';

/** Resolves relative asset paths to full URLs and optionally provides fetch options. */
export interface AssetResolver {
  /** Resolve a relative asset path (e.g. '/models/human-male/model.json') to a full URL. */
  resolve(path: string): string;
  /** Optional fetch options (auth headers, credentials). */
  fetchOpts?(): RequestInit;
}

/** Configuration for creating a CDN resolver. */
export interface CdnResolverOptions {
  /** Auth cookie value (for Chronicle-style session auth). */
  auth?: string;
}

/**
 * Create a simple CDN resolver that prepends a base URL.
 * Pass an empty string for same-origin (local dev server).
 *
 * @example
 * // Remote CDN
 * createCdnResolver('https://models.chronicleclassic.com')
 *
 * // Local dev (Vite serves public/)
 * createCdnResolver('')
 */
export function createCdnResolver(baseUrl: string, opts?: CdnResolverOptions): AssetResolver {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    resolve: (path: string) => (base ? `${base}${path}` : path),
    fetchOpts: opts?.auth
      ? () => ({
          credentials: 'include' as RequestCredentials,
          headers: { Cookie: `chronicle_auth_session=${opts.auth}` },
        })
      : undefined,
  };
}

/** Equipment options passed to ModelViewer.equip() or loadModel(). */
export interface EquipmentOptions {
  weapon?: { path: string; texture?: string };
  offhand?: { path: string; texture?: string };
  armor?: BodyArmor;
}

/** Info about an available animation sequence. */
export interface AnimationInfo {
  seqIndex: number;
  animId: number;
  subAnimId: number;
  label: string;
  duration: number;
}

/** Configuration for the ModelViewer constructor. */
export interface ModelViewerConfig {
  /** DOM element to mount the canvas into. */
  container: HTMLElement;
  /** Asset resolver (use createCdnResolver for simple CDN setup). */
  assets: AssetResolver;
  /** Background color (default: 0x333333). */
  backgroundColor?: number;
}

export type { BodyArmor, LoadedModel, BoneInfo };
