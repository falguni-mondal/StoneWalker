/**
 * STONEWALKER — Relics & Neutral Shrine Buffs (Section 11 [BONUS])
 * Relics guarded on the map grant permanent level-wide bonuses when a friendly unit steps near them.
 */

import type { EntityId, FactionId, RelicEntity, Vec2 } from '../data/types';
import type { EventBus } from '../core/EventBus';

export class RelicManager {
  private readonly relics = new Map<EntityId, RelicEntity>();
  private nextId = 1;

  public clear(): void {
    this.relics.clear();
    this.nextId = 1;
  }

  public spawnRelic(
    name: string,
    position: Vec2,
    bonusType: RelicEntity['bonusType'],
    bonusValue: number,
  ): RelicEntity {
    const id = `relic_${this.nextId++}`;
    const relic: RelicEntity = {
      id,
      name,
      position: { x: position.x, z: position.z },
      bonusType,
      bonusValue,
      capturedBy: null,
    };
    this.relics.set(id, relic);
    return relic;
  }

  public getAll(): RelicEntity[] {
    return Array.from(this.relics.values());
  }

  public updateCaptureCheck(
    unitPositionsByFaction: ReadonlyMap<FactionId, readonly Vec2[]>,
    bus: EventBus,
  ): void {
    const captureRadiusSq = 3.2 * 3.2;
    for (const relic of this.relics.values()) {
      for (const [faction, positions] of unitPositionsByFaction.entries()) {
        if (faction === 'neutral' || relic.capturedBy === faction) {
          continue;
        }
        for (const pos of positions) {
          const dx = pos.x - relic.position.x;
          const dz = pos.z - relic.position.z;
          if (dx * dx + dz * dz <= captureRadiusSq) {
            relic.capturedBy = faction;
            if (faction === 'player') {
              bus.emit('ui:toast', {
                message: `Relic Claimed: ${relic.name}!`,
                level: 'success',
                jumpTo: relic.position,
              });
            }
            break;
          }
        }
      }
    }
  }

  public getBonusMultiplier(
    faction: FactionId,
    bonusType: RelicEntity['bonusType'],
  ): number {
    let bonus = 1.0;
    for (const relic of this.relics.values()) {
      if (relic.capturedBy === faction && relic.bonusType === bonusType) {
        bonus += relic.bonusValue;
      }
    }
    return bonus;
  }

  public serialize(): RelicEntity[] {
    return this.getAll().map((r) => ({
      ...r,
      position: { ...r.position },
    }));
  }

  public deserialize(items: readonly RelicEntity[]): void {
    this.clear();
    for (const item of items) {
      this.relics.set(item.id, {
        ...item,
        position: { ...item.position },
      });
    }
  }
}