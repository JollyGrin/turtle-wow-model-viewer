/**
 * Spatial analysis of diff images to categorize rendering issues.
 *
 * Divides the diff image into a grid and analyzes where differences
 * are concentrated to determine the likely root cause.
 */
import { PNG } from 'pngjs';

export type DiagnosisCategory = 'extraction' | 'conversion' | 'rendering' | 'lighting' | 'unknown';

export interface Diagnosis {
  category: DiagnosisCategory;
  confidence: number; // 0-1
  description: string;
  affectedRegion?: string;
}

/**
 * Body region grid (4 columns × 6 rows):
 *
 *   Row 0: head
 *   Row 1: shoulders / upper chest
 *   Row 2: arms / torso
 *   Row 3: hands / waist
 *   Row 4: upper legs
 *   Row 5: lower legs / feet
 */
const REGION_LABELS = [
  'head', 'shoulders', 'torso', 'hands', 'upper-legs', 'lower-legs',
];

/**
 * Analyze a diff image to determine what category of issue caused the difference.
 */
export function diagnose(diffBuffer: Buffer, diffPct: number): Diagnosis {
  if (diffPct < 5) {
    return { category: 'lighting', confidence: 0.9, description: 'Minor shading/lighting differences only' };
  }

  const png = PNG.sync.read(diffBuffer);
  const { width, height, data } = png;

  // Divide into 4×6 grid and compute diff density per cell
  const cols = 4;
  const rows = 6;
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const cellPixels = cellW * cellH;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let redCount = 0;
      const startX = col * cellW;
      const startY = row * cellH;
      for (let y = startY; y < startY + cellH && y < height; y++) {
        for (let x = startX; x < startX + cellW && x < width; x++) {
          const idx = (y * width + x) * 4;
          // Diff pixels are red (R > 200, G < 50, B < 50)
          if (data[idx] > 200 && data[idx + 1] < 50 && data[idx + 2] < 50) {
            redCount++;
          }
        }
      }
      grid[row][col] = redCount / cellPixels;
    }
  }

  // Analyze patterns
  const rowDensities = grid.map(row => row.reduce((a, b) => a + b, 0) / cols);
  const maxRowDensity = Math.max(...rowDensities);
  const avgDensity = rowDensities.reduce((a, b) => a + b, 0) / rows;

  // Most affected region
  const maxRowIdx = rowDensities.indexOf(maxRowDensity);
  const affectedRegion = REGION_LABELS[maxRowIdx] || 'unknown';

  // High diff concentrated in one area → specific rendering issue
  if (maxRowDensity > 0.5 && maxRowDensity > avgDensity * 3) {
    return {
      category: 'rendering',
      confidence: 0.7,
      description: `High diff concentrated in ${affectedRegion} region`,
      affectedRegion,
    };
  }

  // Very high diff everywhere → likely extraction failure (missing model)
  if (avgDensity > 0.4 && diffPct > 40) {
    return {
      category: 'extraction',
      confidence: 0.8,
      description: 'Major differences across entire model — possible missing asset',
    };
  }

  // Moderate diff spread evenly → conversion or systematic issue
  if (avgDensity > 0.1 && maxRowDensity < avgDensity * 2) {
    return {
      category: 'conversion',
      confidence: 0.5,
      description: 'Moderate differences spread across model — possible texture/geoset conversion issue',
    };
  }

  // Edge-only diffs → shading
  if (diffPct < 25 && maxRowDensity < 0.3) {
    return {
      category: 'lighting',
      confidence: 0.6,
      description: 'Shading differences at edges and contours',
    };
  }

  return {
    category: 'unknown',
    confidence: 0.3,
    description: `${diffPct.toFixed(1)}% diff, no clear pattern`,
    affectedRegion,
  };
}
