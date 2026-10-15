/**
 * STONEWALKER — War Machine & Top-Tier Crawler Spawner Entity Factory (Section 8)
 */

import { BALANCE } from '../data/balance';
import { MACHINES } from '../data/machines';
import type {
  EntityId,
  FactionId,
  MachineRole,
  UnitEntity,
  Vec2,
} from '../data/types';

let machineIdCounter = 1;

export function createMachineEntity(params: {
  id?: EntityId;
  role: MachineRole;
  faction: FactionId;
  position: Vec2;
  parentMachineId?: EntityId | null;
  guardSpot?: Vec2 | null;
}): UnitEntity {
  const def = MACHINES[params.role];
  const id = params.id ?? `mch_${params.faction}_${machineIdCounter++}`;

  return {
    id,
    kind: 'machine',
    role: params.role,
    faction: params.faction,
    position: { x: params.position.x, z: params.position.z },
    rotation: 0,
    hp: def.maxHp,
    maxHp: def.maxHp,
    shieldHp: params.role === 'shell_walker' ? 120 : 0,
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
    parentMachineId: params.parentMachineId ?? null,
    activeCrawlerIds: [],
    crawlerSpawnTimer: def.spawnsCrawler
      ? BALANCE.CRAWLER_SPAWN_INTERVAL_SECONDS
      : 0,
    heroAbilityCooldownTimer: 0,
    isReviving: false,
    reviveTimer: 0,
  };
}