/**
 * STONEWALKER — Chieftain Hero Entity Factory (Section 8B)
 */

import { HEROES } from '../data/heroes';
import type {
  EntityId,
  FactionId,
  TribeId,
  UnitEntity,
  Vec2,
} from '../data/types';

let heroIdCounter = 1;

export function createHeroEntity(params: {
  id?: EntityId;
  faction: FactionId;
  tribe: TribeId;
  position: Vec2;
}): UnitEntity {
  const def = HEROES[params.tribe];
  const id = params.id ?? `hero_${params.faction}_${heroIdCounter++}`;

  return {
    id,
    kind: 'hero',
    role: 'chieftain',
    faction: params.faction,
    position: { x: params.position.x, z: params.position.z },
    rotation: 0,
    hp: def.maxHp,
    maxHp: def.maxHp,
    shieldHp: 50,
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
    guardSpot: { x: params.position.x, z: params.position.z },
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