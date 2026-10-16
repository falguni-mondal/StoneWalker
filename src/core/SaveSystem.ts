/**
 * STONEWALKER — 3-Slot Save/Load, Erase & Auto-Load Manager (Section 15)
 * - Supports max 3 Save Slots (Slot 1, Slot 2, Slot 3).
 * - Defaults to overwriting Slot 1 until the player selects Slot 2 or Slot 3.
 * - Automatically loads the last saved game when the user opens the website.
 * - Provides an Erase function to clear any individual slot.
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

export type SaveSlotIndex = 1 | 2 | 3;

export interface CampaignProgressData {
  version: number;
  starsByLevel: Record<number, number>;
  highestUnlockedLevel: number;
}

export interface SavedBattleSnapshot {
  version: number;
  slot?: SaveSlotIndex;
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

const SLOT_STORAGE_KEYS: Record<SaveSlotIndex, string> = {
  1: 'stonewalker_saveslot_1_v1',
  2: 'stonewalker_saveslot_2_v1',
  3: 'stonewalker_saveslot_3_v1',
};

const ACTIVE_SLOT_KEY = 'stonewalker_active_slot_v1';

const DEFAULT_PROGRESS: CampaignProgressData = {
  version: CONFIG.SAVE_VERSION,
  starsByLevel: {},
  highestUnlockedLevel: 1,
};

export class SaveSystem {
  private corruptDetected = false;
  private activeSlot: SaveSlotIndex = 1;

  public constructor() {
    this.activeSlot = this.loadActiveSlotFromStorage();
  }

  private loadActiveSlotFromStorage(): SaveSlotIndex {
    try {
      const raw = localStorage.getItem(ACTIVE_SLOT_KEY);
      const num = Number(raw);
      if (num === 1 || num === 2 || num === 3) {
        return num;
      }
    } catch {
      // Ignore storage errors
    }
    return 1;
  }

  public getActiveSlot(): SaveSlotIndex {
    return this.activeSlot;
  }

  public setActiveSlot(slot: SaveSlotIndex): void {
    this.activeSlot = slot;
    try {
      localStorage.setItem(ACTIVE_SLOT_KEY, String(slot));
    } catch {
      // Ignore
    }
  }

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
      // Ignore
    }
    return progress;
  }

  /**
   * Saves a battle snapshot to the specified slot (1, 2, or 3), or to the active slot
   * when `'auto'` or `'manual'` is passed.
   */
  public saveBattle(
    snapshot: SavedBattleSnapshot,
    slot: SaveSlotIndex | 'auto' | 'manual' = this.activeSlot,
  ): boolean {
    const resolvedSlot: SaveSlotIndex =
      slot === 'auto' || slot === 'manual' ? this.activeSlot : slot;

    const payload: SavedBattleSnapshot = {
      ...snapshot,
      slot: resolvedSlot,
    };

    try {
      localStorage.setItem(
        SLOT_STORAGE_KEYS[resolvedSlot],
        JSON.stringify(payload),
      );
      // Also mirror to legacy keys so existing unit tests pass seamlessly
      if (slot === 'manual') {
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.MANUAL_SAVE,
          JSON.stringify(payload),
        );
      } else if (slot === 'auto') {
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.AUTOSAVE,
          JSON.stringify(payload),
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Loads a battle snapshot from Slot 1, 2, or 3 (or legacy 'auto'/'manual').
   */
  public loadBattle(
    slot: SaveSlotIndex | 'auto' | 'manual' = this.activeSlot,
  ): SavedBattleSnapshot | null {
    const primaryKey =
      slot === 1 || slot === 2 || slot === 3
        ? SLOT_STORAGE_KEYS[slot]
        : slot === 'manual'
          ? CONFIG.STORAGE_KEYS.MANUAL_SAVE
          : CONFIG.STORAGE_KEYS.AUTOSAVE;

    const fallbackKey =
      slot === 'manual' || slot === 'auto'
        ? SLOT_STORAGE_KEYS[this.activeSlot]
        : null;

    try {
      const raw =
        localStorage.getItem(primaryKey) ??
        (fallbackKey ? localStorage.getItem(fallbackKey) : null);
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

  /**
   * Returns all 3 save slots for the Saved Games UI.
   */
  public getAllSlots(): Record<SaveSlotIndex, SavedBattleSnapshot | null> {
    return {
      1: this.loadBattle(1),
      2: this.loadBattle(2),
      3: this.loadBattle(3),
    };
  }

  /**
   * Finds the most recently saved snapshot across the active slot or Slots 1..3
   * so the game can automatically resume the player's last session on startup.
   */
  public loadMostRecentBattle(): SavedBattleSnapshot | null {
    const slots = this.getAllSlots();
    const activeSnap = slots[this.activeSlot];
    let best: SavedBattleSnapshot | null = activeSnap;

    for (const s of [1, 2, 3] as const) {
      const candidate = slots[s];
      if (!candidate) continue;
      if (!best || candidate.timestamp > best.timestamp) {
        best = candidate;
      }
    }
    if (best?.slot) {
      this.setActiveSlot(best.slot);
    }
    return best;
  }

  /**
   * Erases the saved game in the specified slot (1, 2, or 3).
   */
  public eraseSlot(slot: SaveSlotIndex): void {
    try {
      localStorage.removeItem(SLOT_STORAGE_KEYS[slot]);
      if (slot === this.activeSlot) {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.AUTOSAVE);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.MANUAL_SAVE);
      }
    } catch {
      // Ignore
    }
  }

  public clearAllSaves(): void {
    try {
      localStorage.removeItem(SLOT_STORAGE_KEYS[1]);
      localStorage.removeItem(SLOT_STORAGE_KEYS[2]);
      localStorage.removeItem(SLOT_STORAGE_KEYS[3]);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.AUTOSAVE);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.MANUAL_SAVE);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.PROGRESS);
      this.corruptDetected = false;
    } catch {
      // Ignore
    }
  }
}