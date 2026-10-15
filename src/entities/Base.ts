/**
 * STONEWALKER — Walking Base ("Council Walker") Entity Factory & Helpers (Section 5)
 * Plain-data JSON-serializable factory for the 4x4 mobile fortress with Stand and Move modes.
 */

import { BALANCE } from '../data/balance';
import { BASE_TIER_STATS, BUILDINGS } from '../data/buildings';
import { TRIBES } from '../data/heroes';
import type {
  BuildingEntity,
  EntityId,
  FactionId,
  StructureMode,
  TileCoord,
  TribeId,
  Vec2,
} from '../data/types';

let baseIdCounter = 1;

export function createBaseEntity(params: {
  id?: EntityId;
  faction: FactionId;
  tribe: TribeId;
  tile: TileCoord;
  level?: number;
}): BuildingEntity {
  const id = params.id ?? `base_${params.faction}_${baseIdCounter++}`;
  const level = Math.max(1, Math.min(3, params.level ?? 1));
  const tier = BASE_TIER_STATS[level - 1] ?? BASE_TIER_STATS[0]!;
  const def = BUILDINGS.base;
  const tribeBonus = TRIBES[params.tribe].bonuses.buildingHpMultiplier;
  const maxHp = Math.round(tier.maxHp * tribeBonus);
  const footprint = def.footprint; // 4x4

  const centerPos: Vec2 = {
    x: params.tile.tx + footprint * 0.5,
    z: params.tile.tz + footprint * 0.5,
  };

  return {
    id,
    kind: 'building',
    buildingType: 'base',
    faction: params.faction,
    tile: { tx: params.tile.tx, tz: params.tile.tz },
    position: centerPos,
    footprint,
    hp: maxHp,
    maxHp,
    level,
    isConstructed: true,
    constructionProgress: def.buildTime,
    constructionTotalTime: def.buildTime,
    mode: 'stand',
    path: [],
    moveTarget: null,
    rallyPoint: { x: centerPos.x + 4, z: centerPos.z + 4 },
    queue: [],
    repeatQueue: false,
    fireBurnTimer: 0,
    attackCooldownTimer: 0,
    weaponStock: { club: 0, spear: 0, sling: 0 },
  };
}

export function getBaseEffectiveStats(
  base: BuildingEntity,
  tribe: TribeId,
): {
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  armor: number;
  moveSpeed: number;
} {
  const tier = BASE_TIER_STATS[base.level - 1] ?? BASE_TIER_STATS[0]!;
  const tribeBonuses = TRIBES[tribe].bonuses;
  const isMoving = base.mode === 'move';

  const firepowerMult = isMoving
    ? BALANCE.BASE_MOVE_FIREPOWER_MULTIPLIER
    : 1.0;
  const armorMult = isMoving ? BALANCE.BASE_MOVE_ARMOR_MULTIPLIER : 1.0;

  return {
    attackDamage: Math.round(tier.attackDamage * firepowerMult),
    attackRange: tier.attackRange,
    attackCooldown: tier.attackCooldown,
    armor: Math.round(tier.armor * armorMult),
    moveSpeed: tier.moveSpeed * tribeBonuses.baseMoveSpeedMultiplier,
  };
}

export function setBaseMode(
  base: BuildingEntity,
  mode: StructureMode,
): void {
  if (base.mode === mode) {
    return;
  }
  base.mode = mode;
  if (mode === 'stand') {
    base.path = [];
    base.moveTarget = null;
    base.tile = {
      tx: Math.round(base.position.x - base.footprint * 0.5),
      tz: Math.round(base.position.z - base.footprint * 0.5),
    };
  }
}