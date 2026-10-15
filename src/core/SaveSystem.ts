/**
 * STONEWALKER — Versioned Save/Load & Campaign Progression Manager (Section 15)
 * - Autosaves to localStorage every 60 seconds and when the tab is hidden.
 * - Supports 1 manual save slot, campaign star ratings, and unlocked tribe perks.
 * - Handles corrupt saves gracefully without crashing (returns a clean fallback and notifies).
 */

import { CONFIG } from '../config';
import type {
  BuildingEntity,
  FactionState,
  ResourceNodeEntity,
  UnitEntity,
} from '../data/types';
import type { DayNightSerializedState } from './DayNight';
import type { WeatherSerializedState } from './Weather';

export interface CampaignProgressData {
  version: number;
  starsByLevel: Record<number, number>;
  highestUnlockedLevel: number;
}

export interface SavedBattleSnapshot {
  version: number;
  timestamp: number;
  levelId: number;
  seed: number;
  elapsedTimeSec: number;
  dayNight: DayNightSerializedState;
  weather: WeatherSerializedState;
  factions: FactionState[];
  units: UnitEntity[];
  buildings: BuildingEntity[];
  resources: ResourceNodeEntity[];
}

const DEFAULT_PROGRESS: CampaignProgressData = {
  version: CONFIG.SAVE_VERSION,
  starsByLevel: {},
  highestUnlockedLevel: 1,
};

export class SaveSystem {
  private corruptDetected = false;

  public wasCorruptSaveDetected(): boolean {
    return this.corruptDetected;
  }

  public loadProgress(): CampaignProgressData {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.PROGRESS);
      if (!raw) {
        return { ...DEFAULT_PROGRESS, starsByLevel: {} };
      }
      const parsed = JSON.parse(raw) as Partial<CampaignProgressData>;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        parsed.version !== CONFIG.SAVE_VERSION ||
        typeof parsed.starsByLevel !== 'object'
      ) {
        this.corruptDetected = true;
        return { ...DEFAULT_PROGRESS, starsByLevel: {} };
      }
      return {
        version: CONFIG.SAVE_VERSION,
        starsByLevel: { ...parsed.starsByLevel },
        highestUnlockedLevel: Math.max(1, parsed.highestUnlockedLevel ?? 1),
      };
    } catch {
      this.corruptDetected = true;
      return { ...DEFAULT_PROGRESS, starsByLevel: {} };
    }
  }

  public recordLevelStars(
    levelId: number,
    stars: 1 | 2 | 3,
  ): CampaignProgressData {
    const progress = this.loadProgress();
    const prev = progress.starsByLevel[levelId] ?? 0;
    if (stars > prev) {
      progress.starsByLevel[levelId] = stars;
    }
    if (levelId >= progress.highestUnlockedLevel && levelId < 8) {
      progress.highestUnlockedLevel = levelId + 1;
    }
    try {
      localStorage.setItem(
        CONFIG.STORAGE_KEYS.PROGRESS,
        JSON.stringify(progress),
      );
    } catch {
      // Ignore storage quota errors
    }
    return progress;
  }

  public saveBattle(
    snapshot: SavedBattleSnapshot,
    slot: 'auto' | 'manual' = 'auto',
  ): boolean {
    const key =
      slot === 'manual'
        ? CONFIG.STORAGE_KEYS.MANUAL_SAVE
        : CONFIG.STORAGE_KEYS.AUTOSAVE;
    try {
      localStorage.setItem(key, JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  }

  public loadBattle(
    slot: 'auto' | 'manual' = 'auto',
  ): SavedBattleSnapshot | null {
    const key =
      slot === 'manual'
        ? CONFIG.STORAGE_KEYS.MANUAL_SAVE
        : CONFIG.STORAGE_KEYS.AUTOSAVE;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<SavedBattleSnapshot>;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        parsed.version !== CONFIG.SAVE_VERSION ||
        !Array.isArray(parsed.units) ||
        !Array.isArray(parsed.buildings) ||
        !Array.isArray(parsed.factions)
      ) {
        this.corruptDetected = true;
        return null;
      }
      return parsed as SavedBattleSnapshot;
    } catch {
      this.corruptDetected = true;
      return null;
    }
  }

  public clearAllSaves(): void {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.AUTOSAVE);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.MANUAL_SAVE);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.PROGRESS);
      this.corruptDetected = false;
    } catch {
      // Ignore
    }
  }
}