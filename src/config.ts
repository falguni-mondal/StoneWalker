/**
 * STONEWALKER — Root Engine, Rendering, Input, Audio & Storage Configuration
 * Imported by `src/main.ts` (`./config`) and all subsystems (`../config`).
 */

export const CONFIG = {
  GAME_TITLE: 'STONEWALKER',
  SAVE_VERSION: 1,
  STORAGE_KEYS: {
    SETTINGS: 'stonewalker_settings_v1',
    AUTOSAVE: 'stonewalker_autosave_v1',
    MANUAL_SAVE: 'stonewalker_manualsave_v1',
    PROGRESS: 'stonewalker_progress_v1',
  },

  // Simulation Loop (Section 2)
  /** Fixed simulation step of 20 Hz (50ms) for deterministic RTS logic on mobile CPUs. */
  FIXED_TIMESTEP_SEC: 0.05,
  /** Maximum accumulated frame delta to prevent spiral of death after tab switches. */
  MAX_FRAME_DELTA_SEC: 0.25,
  /** Auto-lower graphics quality if average FPS stays below 40 for 4 consecutive seconds. */
  AUTO_QUALITY_FPS_THRESHOLD: 40,
  AUTO_QUALITY_WINDOW_SECONDS: 4.0,

  // Rendering & Camera (Section 2)
  MAX_PIXEL_RATIO: 2,
  /** 52-degree tilt for a clear 2.5D prehistoric diorama perspective. */
  CAMERA_TILT_DEGREES: 52,
  CAMERA_FOV: 42,
  CAMERA_NEAR: 1.0,
  CAMERA_FAR: 260.0,
  CAMERA_MIN_ZOOM: 18,
  CAMERA_MAX_ZOOM: 72,
  CAMERA_DEFAULT_ZOOM: 38,
  CAMERA_PAN_INERTIA_DECAY: 0.88,
  /** Chunk size (16x16 tiles) for frustum-culled terrain rendering on up to 192x192 maps. */
  TERRAIN_CHUNK_SIZE: 16,
  /** Spatial hash cell size in world units for O(1) neighbor queries. */
  SPATIAL_HASH_CELL_SIZE: 6,

  // Touch & Selection Ergonomics (Section 14)
  TOUCH_FORGIVING_SELECT_RADIUS: 2.4,
  TOUCH_LONG_PRESS_MS: 450,
  TOUCH_DOUBLE_TAP_MS: 300,
  MAX_TOASTS_VISIBLE: 3,
  AUTOSAVE_INTERVAL_SECONDS: 60,
} as const;

export type AppConfig = typeof CONFIG;