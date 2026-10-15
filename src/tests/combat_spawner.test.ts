/**
 * STONEWALKER — Vitest Unit Tests: Crawler Spawner Cap (Max 8), Base Stomp, Veterancy & Powers (Section 17)
 */

import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import type { EntityId, FactionState, UnitEntity } from '../data/types';
import { createBaseEntity } from '../entities/Base';
import { createBuildingEntity } from '../entities/Building';
import { createMachineEntity } from '../entities/Machine';
import { createSoldierEntity } from '../entities/Soldier';
import { createWorkerEntity } from '../entities/Worker';
import { type ActivePowerZone, PowersSystem } from '../systems/Powers';
import { SpawnerSystem } from '../systems/Spawner';
import { StompSystem } from '../systems/Stomp';
import { VeterancySystem } from '../systems/Veterancy';
import { WorldGrid } from '../world/Grid';
import { HeightMap } from '../world/HeightMap';
import { ResourceManager } from '../world/Resources';

describe('Top-Tier Machine Crawler Spawner, Base Stomp, Veterancy & Spirit Powers', () => {
  it('enforces a strict cap of 8 living Crawlers per Mammoth Fortress and resumes when one dies', () => {
    const hm = new HeightMap(64);
    const grid = new WorldGrid(hm);
    const units = new Map<EntityId, UnitEntity>();

    const mammoth = createMachineEntity({
      role: 'mammoth_fortress',
      faction: 'player',
      position: { x: 20, z: 20 },
    });
    units.set(mammoth.id, mammoth);

    // Step 10 times of 30s each (300 seconds total)
    for (let i = 0; i < 10; i++) {
      SpawnerSystem.update(units, grid, 30.1, (crawler) => {
        units.set(crawler.id, crawler);
      });
    }

    expect(mammoth.activeCrawlerIds.length).toBe(8);

    // Kill 1 Crawler and verify spawning resumes back to 8
    const firstCrawlerId = mammoth.activeCrawlerIds[0]!;
    const firstCrawler = units.get(firstCrawlerId)!;
    firstCrawler.hp = 0;

    SpawnerSystem.update(units, grid, 1.0, (crawler) => {
      units.set(crawler.id, crawler);
    });
    expect(mammoth.activeCrawlerIds.length).toBe(7);

    SpawnerSystem.update(units, grid, 30.1, (crawler) => {
      units.set(crawler.id, crawler);
    });
    expect(mammoth.activeCrawlerIds.length).toBe(8);
  });

  it('Walking Base Stomp crushes trees into wood, kills small enemies, and NEVER hurts friendly units', () => {
    const hm = new HeightMap(64);
    const grid = new WorldGrid(hm);
    const resources = new ResourceManager();
    const bus = new EventBus();

    const base = createBaseEntity({
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 20, tz: 20 },
    });
    base.mode = 'move';
    base.path = [{ x: 25, z: 22 }];

    // Spawn a wood tree inside the Base's 4x4 footprint (20..23, 20..23)
    resources.spawnNode('wood', { tx: 21, tz: 21 }, 200, grid);

    // Friendly worker under the Base's feet
    const friendlyWorker = createWorkerEntity({
      faction: 'player',
      position: { x: 21.5, z: 21.5 },
    });

    // Small enemy slinger under the Base's feet
    const enemySlinger = createSoldierEntity({
      role: 'slinger',
      faction: 'enemy_1',
      position: { x: 22, z: 22 },
    });

    // Enemy building in path
    const enemyHut = createBuildingEntity({
      buildingType: 'hut',
      faction: 'enemy_1',
      tribe: 'ember_tribe',
      tile: { tx: 22, tz: 22 },
      isConstructed: true,
    });

    const fState: FactionState = {
      faction: 'player',
      tribe: 'stonebacks',
      resources: { food: 100, wood: 100, stone: 100, hide: 50, bronze: 0 },
      storageCaps: { ...BALANCE.BASE_STORAGE_CAP },
      populationUsed: 2,
      populationCap: 20,
      workerPriorities: { food: 3, wood: 3, stone: 3, hide: 1, bronze: 1 },
      researchedTechs: [],
      activeResearch: null,
      unitWeaponTiers: {
        worker: 0,
        clubber: 0,
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
      unlockedWeaponTier: 0,
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
      enemiesDefeated: 0,
    };

    const res = StompSystem.applyBaseStomp(
      base,
      [friendlyWorker, enemySlinger],
      [base, enemyHut],
      fState,
      grid,
      resources,
      bus,
      0.5,
    );

    expect(res.treesCrushed).toBe(1);
    expect(fState.resources.wood).toBe(100 + BALANCE.BASE_STOMP_TREE_WOOD_YIELD);
    expect(enemySlinger.hp).toBe(0);
    expect(friendlyWorker.hp).toBe(friendlyWorker.maxHp); // Friendlies never hurt!
    expect(enemyHut.hp).toBeLessThan(enemyHut.maxHp);
  });

  it('grants Veterancy ranks 1, 2, and 3 at kill thresholds and boosts stats', () => {
    const clubber = createSoldierEntity({
      role: 'clubber',
      faction: 'player',
      position: { x: 10, z: 10 },
    });
    const baseMaxHp = clubber.maxHp;

    for (let k = 0; k < BALANCE.VETERANCY_KILL_THRESHOLDS[0]; k++) {
      VeterancySystem.recordKill(clubber);
    }
    expect(clubber.veterancyRank).toBe(1);
    expect(clubber.maxHp).toBeGreaterThan(baseMaxHp);

    for (let k = clubber.veterancyKills; k < BALANCE.VETERANCY_KILL_THRESHOLDS[2]; k++) {
      VeterancySystem.recordKill(clubber);
    }
    expect(clubber.veterancyRank).toBe(3);
    expect(VeterancySystem.getDamageMultiplier(clubber)).toBe(1.35);
  });

  it('tracks Spirit Power cooldowns accurately when cast', () => {
    const hm = new HeightMap(32);
    const grid = new WorldGrid(hm);
    const bus = new EventBus();
    const base = createBaseEntity({
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 10, tz: 10 },
    });
    const fState: FactionState = {
      faction: 'player',
      tribe: 'stonebacks',
      resources: { ...BALANCE.STARTING_RESOURCES },
      storageCaps: { ...BALANCE.BASE_STORAGE_CAP },
      populationUsed: 1,
      populationCap: 12,
      workerPriorities: { food: 3, wood: 3, stone: 3, hide: 1, bronze: 1 },
      researchedTechs: [],
      activeResearch: null,
      unitWeaponTiers: {
        worker: 0,
        clubber: 0,
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
      unlockedWeaponTier: 0,
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
      enemiesDefeated: 0,
    };

    const zones: ActivePowerZone[] = [];
    const buildings = new Map([[base.id, base]]);
    const units = new Map<EntityId, UnitEntity>();
    const factions = new Map([['player', fState]]);

    const casted = PowersSystem.castSpiritPower(
      'healing_rain',
      { x: 12, z: 12 },
      fState,
      units,
      buildings,
      factions,
      zones,
      grid,
      bus,
    );

    expect(casted).toBe(true);
    expect(fState.powerCooldowns.healing_rain).toBe(45);

    PowersSystem.update(factions, units, buildings, zones, bus, 15);
    expect(fState.powerCooldowns.healing_rain).toBe(30);
  });
});