/**
 * STONEWALKER — Projectile Entity Factory (Section 10)
 */

import type {
  DamageType,
  EntityId,
  FactionId,
  ProjectileEntity,
  Vec2,
} from '../data/types';

let projectileCounter = 1;

export function createProjectileEntity(params: {
  id?: EntityId;
  sourceId: EntityId;
  faction: FactionId;
  position: Vec2;
  targetPosition: Vec2;
  targetEntityId: EntityId | null;
  speed: number;
  damage: number;
  damageType: DamageType;
  splashRadius?: number;
  causesFire?: boolean;
}): ProjectileEntity {
  const id = params.id ?? `proj_${projectileCounter++}`;
  return {
    id,
    sourceId: params.sourceId,
    faction: params.faction,
    position: { x: params.position.x, z: params.position.z },
    targetPosition: { x: params.targetPosition.x, z: params.targetPosition.z },
    targetEntityId: params.targetEntityId,
    speed: params.speed,
    damage: params.damage,
    damageType: params.damageType,
    splashRadius: params.splashRadius ?? 0,
    causesFire: params.causesFire ?? params.damageType === 'fire',
  };
}