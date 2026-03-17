/**
 * Character Texture Compositor
 *
 * Composites multiple CharSections texture layers (skin, face, underwear)
 * into a single 256x256 body atlas.
 *
 * Region layout from CharComponentTextureSections.dbc (vanilla 256x256).
 * Values hardcoded from wowdev.wiki and WoWModelViewer source.
 */

import type { AssetResolver } from './types';

/** Compositing region identifiers */
export enum CharRegion {
  ARM_UPPER = 0,
  ARM_LOWER = 1,
  HAND = 2,
  FACE_UPPER = 3,
  FACE_LOWER = 4,
  TORSO_UPPER = 5,
  TORSO_LOWER = 6,
  LEG_UPPER = 7,
  LEG_LOWER = 8,
  FOOT = 9,
}

/** Region rectangle on the 256x256 atlas */
interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Vanilla 256x256 character texture layout (CharComponentTextureSections) */
const REGION_RECTS: Record<CharRegion, RegionRect> = {
  [CharRegion.ARM_UPPER]:   { x: 0,   y: 0,   width: 128, height: 64 },
  [CharRegion.ARM_LOWER]:   { x: 0,   y: 64,  width: 128, height: 64 },
  [CharRegion.HAND]:        { x: 0,   y: 128, width: 128, height: 32 },
  [CharRegion.FACE_UPPER]:  { x: 0,   y: 160, width: 128, height: 32 },
  [CharRegion.FACE_LOWER]:  { x: 0,   y: 192, width: 128, height: 64 },
  [CharRegion.TORSO_UPPER]: { x: 128, y: 0,   width: 128, height: 64 },
  [CharRegion.TORSO_LOWER]: { x: 128, y: 64,  width: 128, height: 32 },
  [CharRegion.LEG_UPPER]:   { x: 128, y: 96,  width: 128, height: 64 },
  [CharRegion.LEG_LOWER]:   { x: 128, y: 160, width: 128, height: 64 },
  [CharRegion.FOOT]:        { x: 128, y: 224, width: 128, height: 32 },
};

/** A texture layer to composite onto the atlas */
interface TextureLayer {
  imageData: ImageData;
  region: CharRegion;
  layer: number; // Lower = drawn first (behind)
}

/**
 * Composite character textures into a single 256x256 atlas.
 *
 * @param baseImageData - Full 256x256 body skin texture (CharSections type=0)
 * @param layers - Additional overlay layers (face, underwear, equipment)
 * @returns HTMLCanvasElement with the composited texture
 */
export function composeCharTexture(
  baseImageData: ImageData,
  layers: TextureLayer[],
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Step 1: Draw base skin texture (full canvas)
  ctx.putImageData(baseImageData, 0, 0);

  // Step 2: Sort layers by priority (lower layer number drawn first)
  const sorted = [...layers].sort((a, b) => a.layer - b.layer);

  // Step 3: Overlay each layer into its region
  for (const layer of sorted) {
    const rect = REGION_RECTS[layer.region];
    burnComponent(ctx, layer.imageData, rect);
  }

  return canvas;
}

/**
 * Draw a texture layer into a region on the atlas canvas.
 * Handles scaling if the source texture size differs from the region size.
 */
function burnComponent(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  rect: RegionRect,
): void {
  if (imageData.width === rect.width && imageData.height === rect.height) {
    // Use a temp canvas for alpha-over blending (putImageData replaces pixels)
    const tmp = document.createElement('canvas');
    tmp.width = imageData.width;
    tmp.height = imageData.height;
    tmp.getContext('2d')!.putImageData(imageData, 0, 0);
    ctx.drawImage(tmp, rect.x, rect.y);
  } else {
    // Scale source to fit region
    const tmp = document.createElement('canvas');
    tmp.width = imageData.width;
    tmp.height = imageData.height;
    tmp.getContext('2d')!.putImageData(imageData, 0, 0);
    ctx.drawImage(tmp, 0, 0, imageData.width, imageData.height,
                  rect.x, rect.y, rect.width, rect.height);
  }
}

/**
 * Load a .tex file and return ImageData for compositing.
 * .tex format: uint16 width + uint16 height + RGBA pixels.
 */
export async function loadTexImageData(url: string, resolver: AssetResolver): Promise<ImageData> {
  const res = await fetch(resolver.resolve(url), resolver.fetchOpts?.());
  const buf = await res.arrayBuffer();
  const headerView = new DataView(buf, 0, 4);
  const width = headerView.getUint16(0, true);
  const height = headerView.getUint16(2, true);
  const pixels = new Uint8ClampedArray(buf, 4);
  return new ImageData(pixels, width, height);
}
