/**
 * STONEWALKER — Camp Building Entity Factory & Helpers (Section 6)
 * Every building has a unique role plus Stand and Move modes.
 */

import { BALANCE } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import { TRIBES } from '../data/heroes';
import type {
  BuildingEntity,
  BuildingType,
  EntityId,
  FactionId,
  StructureMode,
  TileCoord,
  TribeId,
} from '../data/types';

let buildingIdCounter = 1;

export function createBuildingEntity(params: {
  id?: EntityId;
  buildingType: Exclude<BuildingType, 'base'>;
  faction: FactionId;
  tribe: TribeId;
  tile: TileCoord;
  isConstructed?: boolean;
  level?: number;
}): BuildingEntity {
  const id = params.id ?? `bld_${params.faction}_${buildingIdCounter++}`;
  const def = BUILDINGS[params.buildingType];
  const level = Math.max(1, Math.min(def.maxLevel, params.level ?? 1));
  const levelMult = 1 + (level - 1) * 0.25;
  const tribeBonus = TRIBES[params.tribe].bonuses.buildingHpMultiplier;
  const maxHp = Math.round(def.maxHp * levelMult * tribeBonus);
  const constructed = params.isConstructed ?? false;

  const centerPos = {
    x: params.tile.tx + def.footprint * 0.5,
    z: params.tile.tz + def.footprint * 0.5,
  };

  return {
    id,
    kind: 'building',
    buildingType: params.buildingType,
    faction: params.faction,
    tile: { tx: params.tile.tx, tz: params.tile.tz },
    position: centerPos,
    footprint: def.footprint,
    hp: constructed ? maxHp : Math.max(25, Math.round(maxHp * 0.15)),
    maxHp,
    level,
    isConstructed: constructed,
    constructionProgress: constructed ? def.buildTime : 0,
    constructionTotalTime: def.buildTime,
    mode: 'stand',
    path: [],
    moveTarget: null,
    rallyPoint: { x: centerPos.x + def.footprint, z: centerPos.z + def.footprint },
    queue: [],
    repeatQueue: false,
    fireBurnTimer: 0,
    attackCooldownTimer: 0,
    weaponStock:
      params.buildingType === 'weapon_station'
        ? { club: 2, spear: 1, sling: 1 }
        : { club: 0, spear: 0, sling: 0 },
  };
}

export function setBuildingMode(
  building: BuildingEntity,
  mode: StructureMode,
): void {
  if (!building.isConstructed || building.mode === mode) {
    return;
  }
  building.mode = mode;
  if (mode === 'move') {
    // Moving buildings have reduced effective structural HP (Section 6)
    const hpRatio = building.hp / Math.max(1, building.maxHp);
    building.maxHp = Math.round(
      building.maxHp * BALANCE.BUILDING_MOVE_HP_MULTIPLIER,
    );
    building.hp = Math.max(1, Math.round(building.maxHp * hpRatio));
  } else {
    const hpRatio = building.hp / Math.max(1, building.maxHp);
    building.maxHp = Math.round(
      building.maxHp / BALANCE.BUILDING_MOVE_HP_MULTIPLIER,
    );
    building.hp = Math.min(
      building.maxHp,
      Math.max(1, Math.round(building.maxHp * hpRatio)),
    );
    building.path = [];
    building.moveTarget = null;
    building.tile = {
      tx: Math.round(building.position.x - building.footprint * 0.5),
      tz: Math.round(building.position.z - building.footprint * 0.5),
    };
  }
}