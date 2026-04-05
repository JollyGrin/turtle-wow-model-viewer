/**
 * Pixel comparison using pixelmatch.
 */
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffResult {
  /** Percentage of pixels that differ (0-100) */
  diffPct: number;
  /** Number of differing pixels */
  diffCount: number;
  /** Total pixels compared */
  totalPixels: number;
  /** Diff image as PNG buffer (differing pixels highlighted in red) */
  diffBuffer: Buffer;
}

/**
 * Compare two PNG buffers and return diff statistics + diff image.
 */
export function comparePngs(imgA: Buffer, imgB: Buffer): DiffResult {
  const pngA = PNG.sync.read(imgA);
  const pngB = PNG.sync.read(imgB);

  // Use the smaller dimensions if they differ
  const width = Math.min(pngA.width, pngB.width);
  const height = Math.min(pngA.height, pngB.height);
  const totalPixels = width * height;

  // Crop both images to the same size if needed
  const dataA = cropImageData(pngA, width, height);
  const dataB = cropImageData(pngB, width, height);

  const diff = new PNG({ width, height });

  const diffCount = pixelmatch(
    dataA,
    dataB,
    diff.data,
    width,
    height,
    {
      threshold: 0.1,       // Sensitivity (0 = exact, 1 = loose)
      includeAA: false,     // Ignore anti-aliasing differences
      alpha: 0.1,           // Background alpha in diff image
      diffColor: [255, 0, 0], // Highlight diffs in red
    }
  );

  const diffPct = (diffCount / totalPixels) * 100;
  const diffBuffer = PNG.sync.write(diff);

  return { diffPct, diffCount, totalPixels, diffBuffer };
}

/** Crop image data to a specific width/height (top-left corner). */
function cropImageData(png: PNG, targetWidth: number, targetHeight: number): Buffer {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png.data as unknown as Buffer;
  }

  const buf = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const srcOffset = y * png.width * 4;
    const dstOffset = y * targetWidth * 4;
    (png.data as unknown as Buffer).copy(buf, dstOffset, srcOffset, srcOffset + targetWidth * 4);
  }
  return buf;
}
