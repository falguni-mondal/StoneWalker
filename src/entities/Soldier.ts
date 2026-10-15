/**
 * STONEWALKER — Combat Troop Entity Factory (Section 8)
 * Creates Clubbers, Spearmen, Shield Bearers, Slingers, Bow Hunters, Scouts, and Shamans.
 */

import { UNITS } from '../data/units';
import type {
  EntityId,
  FactionId,
  UnitEntity,
  UnitRole,
  Vec2,
} from '../data/types';

let soldierIdCounter = 1;

export function createSoldierEntity(params: {
  id?: EntityId;
  role: Exclude<UnitRole, 'worker'>;
  faction: FactionId;
  position: Vec2;
  guardSpot?: Vec2 | null;
}): UnitEntity {
  const def = UNITS[params.role];
  const id = params.id ?? `sld_${params.faction}_${soldierIdCounter++}`;

  return {
    id,
    kind: 'unit',
    role: params.role,
    faction: params.faction,
    position: { x: params.position.x, z: params.position.z },
    rotation: 0,
    hp: def.maxHp,
    maxHp: def.maxHp,
    shieldHp: params.role === 'shield_bearer' ? 40 : 0,
    speed: def.speed,
    attackCooldownTimer: 0,
    path: [],
    targetEntityId: null,
    moveTarget: null,
    stance: 'aggressive',
    status: 'guarding',
    idleTimer: 0,
    veterancyKills: 0,
    veterancyRank: 0,
    guardSpot: params.guardSpot
      ? { x: params.guardSpot.x, z: params.guardSpot.z }
      : { x: params.position.x, z: params.position.z },
    carryResourceType: null,
    carryAmount: 0,
    jobMemory: {
      jobType: 'none',
      targetEntityId: null,
      resourceType: null,
      targetPosition: null,
    },
    equippedEmergencyWeapon: null,
    parentMachineId: null,
    activeCrawlerIds: [],
    crawlerSpawnTimer: 0,
    heroAbilityCooldownTimer: 0,
    isReviving: false,
    reviveTimer: 0,
  };
}