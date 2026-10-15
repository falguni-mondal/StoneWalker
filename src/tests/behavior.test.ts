/**
 * STONEWALKER — Vitest Unit Tests: Smart 15s Idle Behavior & Alarm Response (Sections 9A, 9B & 17)
 */

import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import type { BuildingEntity, FactionState, UnitEntity } from '../data/types';
import { createBaseEntity } from '../entities/Base';
import { createBuildingEntity } from '../entities/Building';
import { createSoldierEntity } from '../entities/Soldier';
import { createWorkerEntity } from '../entities/Worker';
import { AlarmResponseSystem } from '../systems/AlarmResponse';
import { IdleBehaviorSystem } from '../systems/IdleBehavior';
import { WorldGrid } from '../world/Grid';
import { HeightMap } from '../world/HeightMap';
import { ResourceManager } from '../world/Resources';

function makeDummyFactionState(): FactionState {
  return {
    faction: 'player',
    tribe: 'stonebacks',
    resources: { ...BALANCE.STARTING_RESOURCES },
    storageCaps: { ...BALANCE.BASE_STORAGE_CAP },
    populationUsed: 2,
    populationCap: 20,
    workerPriorities: { food: 5, wood: 3, stone: 2, hide: 1, bronze: 1 },
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
}

describe('Smart Unit Behavior (Section 9A & 9B)', () => {
  it('Worker near Base returns to its previous job after 15 seconds idle', () => {
    const hm = new HeightMap(96);
    const grid = new WorldGrid(hm);
    const resources = new ResourceManager();
    const fState = makeDummyFactionState();

    const base = createBaseEntity({
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 20, tz: 20 },
    });
    const stoneNode = resources.spawnNode(
      'stone',
      { tx: 26, tz: 20 },
      200,
      grid,
    );

    const worker = createWorkerEntity({
      faction: 'player',
      position: { x: 23, z: 23 }, // Within HOME_BASE_RADIUS_TILES (24)
    });
    worker.jobMemory = {
      jobType: 'gather',
      targetEntityId: stoneNode.id,
      resourceType: 'stone',
      targetPosition: { ...stoneNode.position },
    };
    worker.status = 'idle';

    IdleBehaviorSystem.update(
      [worker],
      [base],
      new Map([['player', fState]]),
      resources,
      grid,
      15.1, // Exceeds 15-second idle timeout
    );

    expect(worker.status).toBe('working');
    expect(worker.jobMemory.resourceType).toBe('stone');
    expect(worker.path.length).toBeGreaterThan(0);
  });

  it('Worker FAR from Base adopts nearest resource node as its NEW permanent job after 15s idle', () => {
    const hm = new HeightMap(96);
    const grid = new WorldGrid(hm);
    const resources = new ResourceManager();
    const fState = makeDummyFactionState();

    const base = createBaseEntity({
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 10, tz: 10 },
    });

    // Distant wood node near (75, 75)
    const distantWood = resources.spawnNode(
      'wood',
      { tx: 76, tz: 75 },
      200,
      grid,
    );

    const worker = createWorkerEntity({
      faction: 'player',
      position: { x: 74, z: 75 }, // Far outside HOME_BASE_RADIUS_TILES
    });
    // Previously gathered stone near base
    worker.jobMemory = {
      jobType: 'gather',
      targetEntityId: 'old_stone_id',
      resourceType: 'stone',
      targetPosition: { x: 14, z: 14 },
    };
    worker.status = 'idle';

    IdleBehaviorSystem.update(
      [worker],
      [base],
      new Map([['player', fState]]),
      resources,
      grid,
      15.2,
    );

    expect(worker.status).toBe('working');
    expect(worker.jobMemory.resourceType).toBe('wood');
    expect(worker.jobMemory.targetEntityId).toBe(distantWood.id);
  });

  it('Soldiers near Base return to spread-out guard spots; far soldiers stay put', () => {
    const hm = new HeightMap(96);
    const grid = new WorldGrid(hm);
    const resources = new ResourceManager();
    const fState = makeDummyFactionState();

    const base = createBaseEntity({
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 20, tz: 20 },
    });

    const nearSoldier = createSoldierEntity({
      role: 'clubber',
      faction: 'player',
      position: { x: 35, z: 22 }, // Near base (dist ~13 <= 24)
    });
    nearSoldier.status = 'idle';

    const farSoldier = createSoldierEntity({
      role: 'spearman',
      faction: 'player',
      position: { x: 80, z: 80 }, // Far from base
    });
    farSoldier.status = 'idle';

    IdleBehaviorSystem.update(
      [nearSoldier, farSoldier],
      [base],
      new Map([['player', fState]]),
      resources,
      grid,
      15.5,
    );

    expect(nearSoldier.status).toBe('guarding');
    expect(nearSoldier.path.length).toBeGreaterThan(0);

    expect(farSoldier.status).toBe('guarding');
    expect(farSoldier.path.length).toBe(0);
    expect(farSoldier.guardSpot).toEqual({ x: 80, z: 80 });
  });

  it('Alarm Response: Worker grabs weapon from Weapon Station and returns it when threat clears', () => {
    const hm = new HeightMap(64);
    const grid = new WorldGrid(hm);
    const bus = new EventBus();
    const fState = makeDummyFactionState();

    const base = createBaseEntity({
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 20, tz: 20 },
    });
    const station = createBuildingEntity({
      buildingType: 'weapon_station',
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 25, tz: 20 },
      isConstructed: true,
    });
    station.weaponStock = { club: 1, spear: 1, sling: 0 };

    const worker = createWorkerEntity({
      faction: 'player',
      position: { x: 24, z: 22 },
    });
    worker.jobMemory = {
      jobType: 'gather',
      targetEntityId: 'res_1',
      resourceType: 'wood',
      targetPosition: { x: 30, z: 30 },
    };

    const enemyRaider = createSoldierEntity({
      role: 'clubber',
      faction: 'enemy_1',
      position: { x: 21, z: 21 },
    });

    const units: UnitEntity[] = [worker, enemyRaider];
    const buildings: BuildingEntity[] = [base, station];

    AlarmResponseSystem.triggerAlarm(
      base,
      enemyRaider.id,
      fState,
      units,
      buildings,
      grid,
      bus,
    );

    expect(fState.alarmActive).toBe(true);
    expect(worker.equippedEmergencyWeapon).toBe('spear');
    expect(station.weaponStock.spear).toBe(0);
    expect(worker.status).toBe('fighting');

    // Kill the enemy raider and advance time past ALARM_CLEAR_DELAY_SECONDS (5s)
    enemyRaider.hp = 0;
    AlarmResponseSystem.update(fState, units, buildings, grid, bus, 5.5);

    expect(fState.alarmActive).toBe(false);
    expect(worker.equippedEmergencyWeapon).toBeNull();
    expect(station.weaponStock.spear).toBe(1); // Returned to Weapon Station!
    expect(worker.status).toBe('working');
  });
});