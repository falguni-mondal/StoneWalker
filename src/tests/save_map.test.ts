/**
 * STONEWALKER — Vitest Unit Tests: Save/Load Round Trip, Corrupt Save Recovery & Map Validation (Section 17)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { SaveSystem, type SavedBattleSnapshot } from '../core/SaveSystem';
import { BALANCE } from '../data/balance';
import { CAMPAIGN_LEVELS } from '../data/levels';
import { createBaseEntity } from '../entities/Base';
import { createWorkerEntity } from '../entities/Worker';
import { MapGenerator } from '../world/MapGenerator';

// Minimal in-memory localStorage polyfill for Node Vitest environment
const memoryStorage = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, val: string) => memoryStorage.set(key, val),
      removeItem: (key: string) => memoryStorage.delete(key),
      clear: () => memoryStorage.clear(),
    },
  });
}

describe('SaveSystem Round-Trip & MapGenerator Programmatic Validation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips battle snapshots and campaign star progress cleanly', () => {
    const saveSys = new SaveSystem();
    saveSys.recordLevelStars(1, 3);
    const progress = saveSys.loadProgress();
    expect(progress.starsByLevel[1]).toBe(3);
    expect(progress.highestUnlockedLevel).toBe(2);

    const snapshot: SavedBattleSnapshot = {
      version: CONFIG.SAVE_VERSION,
      timestamp: 123456,
      levelId: 1,
      seed: 10101,
      elapsedTimeSec: 88,
      dayNight: { timeOfDay: 0.4, cycleDurationSec: 240, isNight: false },
      weather: {
        currentWeather: 'clear',
        timerSec: 10,
        nextChangeSec: 90,
        theme: 'green_valley',
      },
      factions: [
        {
          faction: 'player',
          tribe: 'stonebacks',
          resources: { ...BALANCE.STARTING_RESOURCES },
          storageCaps: { ...BALANCE.BASE_STORAGE_CAP },
          populationUsed: 1,
          populationCap: 12,
          workerPriorities: { food: 3, wood: 3, stone: 3, hide: 1, bronze: 1 },
          researchedTechs: ['flint_tools'],
          activeResearch: null,
          unitWeaponTiers: {
            worker: 0,
            clubber: 1,
            spearman: 0,
            shield_bearer: 0,
            slinger: 0,
            bow_hunter: 0,
            scout: 0,
            shaman: 0,
          },
          unitArmorTiers: {
            worker: 0,
            clubber: 0,
            spearman: 0,
            shield_bearer: 0,
            slinger: 0,
            bow_hunter: 0,
            scout: 0,
            shaman: 0,
          },
          unlockedWeaponTier: 1,
          unlockedArmorTier: 0,
          powerCooldowns: {
            healing_rain: 0,
            rally_roar: 0,
            fire_rain: 0,
            earthquake: 0,
          },
          alarmActive: false,
          alarmPosition: null,
          alarmTimer: 0,
          unitsLost: 0,
          enemiesDefeated: 2,
        },
      ],
      units: [
        createWorkerEntity({
          faction: 'player',
          position: { x: 20, z: 20 },
        }),
      ],
      buildings: [
        createBaseEntity({
          faction: 'player',
          tribe: 'stonebacks',
          tile: { tx: 16, tz: 16 },
        }),
      ],
      resources: [],
    };

    expect(saveSys.saveBattle(snapshot, 'manual')).toBe(true);
    const loaded = saveSys.loadBattle('manual');
    expect(loaded).not.toBeNull();
    expect(loaded?.seed).toBe(10101);
    expect(loaded?.factions[0]?.researchedTechs).toContain('flint_tools');
    expect(loaded?.units.length).toBe(1);
    expect(loaded?.buildings.length).toBe(1);
  });

  it('recovers gracefully when localStorage contains corrupt JSON', () => {
    localStorage.setItem(CONFIG.STORAGE_KEYS.AUTOSAVE, '{corrupt_json!!!');
    localStorage.setItem(CONFIG.STORAGE_KEYS.PROGRESS, '{"version":999}');

    const saveSys = new SaveSystem();
    const battle = saveSys.loadBattle('auto');
    const progress = saveSys.loadProgress();

    expect(battle).toBeNull();
    expect(progress.highestUnlockedLevel).toBe(1);
    expect(saveSys.wasCorruptSaveDetected()).toBe(true);
  });

  it('generates and programmatically validates Campaign maps with connected paths and reachable resources', () => {
    for (const level of CAMPAIGN_LEVELS.slice(0, 3)) {
      const world = MapGenerator.generate(level);
      expect(world.size).toBe(level.size);
      expect(MapGenerator.validateWorld(world)).toBe(true);
    }
  });
});