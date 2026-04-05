/**
 * Fixed camera presets for consistent screenshots across both viewers.
 *
 * These values need empirical calibration — run the test page manually
 * and adjust until both viewers show comparable angles.
 *
 * Our viewer: Three.js with OrbitControls. Default front view looks along -X.
 * ZamImg: WebGL with custom orbital camera (azimuth/zenith/distance).
 */

export interface CameraPreset {
  /** Our viewer: camera position {x, y, z} */
  position: { x: number; y: number; z: number };
  /** Our viewer: look-at target {x, y, z} */
  target: { x: number; y: number; z: number };
  /** ZamImg: azimuth in radians (0 = front) */
  zamAzimuth: number;
  /** ZamImg: zenith in radians (0 = eye level) */
  zamZenith: number;
  /** ZamImg: camera distance */
  zamDistance: number;
}

/**
 * Predefined angles. The `dist` and `targetY` values are placeholders —
 * they get overridden per-model by frameCameraOnModel / setCamera.
 * The relative positions and ZamImg angles are what matter.
 */
export const PRESETS: Record<string, CameraPreset> = {
  front: {
    position: { x: 2.4, y: 0.95, z: 0 },
    target: { x: 0, y: 0.85, z: 0 },
    zamAzimuth: 0,
    zamZenith: 0,
    zamDistance: 12,
  },
  side: {
    position: { x: 0, y: 0.95, z: 2.4 },
    target: { x: 0, y: 0.85, z: 0 },
    zamAzimuth: Math.PI / 2,
    zamZenith: 0,
    zamDistance: 12,
  },
};

export type AngleKey = keyof typeof PRESETS;
export const ANGLE_KEYS = Object.keys(PRESETS) as AngleKey[];
