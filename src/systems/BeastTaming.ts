/**
 * STONEWALKER — [BONUS] Wild Beast Taming System (Sections 6 & 8)
 * A constructed Beast Pen with enough Food can tame a nearby wild beast (Boar, Sabertooth,
 * or Mammoth) when a friendly Worker stays close. Tamed beasts join the faction's army.
 */

import type { EventBus } from '../core/EventBus';
import { BEASTS } from '../data/beasts';
import type {
  BeastRole,
  BuildingEntity,
  EntityId,
  FactionState,
  UnitEntity,
} from '../data/types';

export class BeastTamingSystem {
  private static readonly progressByBeastId = new Map<EntityId, number>();

  public static update(
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: Iterable<BuildingEntity>,
    factionById: ReadonlyMap<string, FactionState>,
    bus: EventBus,
    dt: number,
  ): void {
    const beastPens: BuildingEntity[] = [];
    for (const b of buildings) {
      if (
        b.hp > 0 &&
        b.isConstructed &&
        b.mode === 'stand' &&
        b.buildingType === 'beast_pen'
      ) {
        beastPens.push(b);
      }
    }
    if (beastPens.length === 0) {
      return;
    }

    for (const beast of units.values()) {
      if (
        beast.hp <= 0 ||
        beast.kind !== 'beast' ||
        beast.faction !== 'neutral'
      ) {
        continue;
      }

      const def = BEASTS[beast.role as BeastRole] ?? BEASTS.boar;

      // Find a Beast Pen within 16 tiles and a friendly Worker within 5 tiles of the beast
      let matchingPen: BuildingEntity | null = null;
      for (const pen of beastPens) {
        const distPen = Math.hypot(
          pen.position.x - beast.position.x,
          pen.position.z - beast.position.z,
        );
        if (distPen <= 16) {
          matchingPen = pen;
          break;
        }
      }
      if (!matchingPen) {
        continue;
      }

      const fState = factionById.get(matchingPen.faction);
      if (!fState || fState.resources.food < def.tameFoodCost) {
        continue;
      }

      // Check cap for this beast role
      let currentTamedCount = 0;
      let workerNearby = false;
      for (const u of units.values()) {
        if (u.hp <= 0 || u.faction !== matchingPen.faction) {
          continue;
        }
        if (u.kind === 'beast' && u.role === beast.role) {
          currentTamedCount++;
        }
        if (u.role === 'worker') {
          const d = Math.hypot(
            u.position.x - beast.position.x,
            u.position.z - beast.position.z,
          );
          if (d <= 5.5) {
            workerNearby = true;
          }
        }
      }

      if (!workerNearby || currentTamedCount >= def.maxTamedCount) {
        continue;
      }

      const prev = this.progressByBeastId.get(beast.id) ?? 0;
      const next = prev + dt;
      this.progressByBeastId.set(beast.id, next);

      if (next >= def.tameTimeSec) {
        this.progressByBeastId.delete(beast.id);
        fState.resources.food = Math.max(
          0,
          fState.resources.food - def.tameFoodCost,
        );
        beast.faction = matchingPen.faction;
        beast.hp = beast.maxHp;
        beast.guardSpot = {
          x: matchingPen.position.x + 3,
          z: matchingPen.position.z + 3,
        };
        if (matchingPen.faction === 'player') {
          bus.emit('ui:toast', {
            message: `Wild ${def.name} tamed at the Beast Pen!`,
            level: 'success',
            jumpTo: beast.position,
          });
        }
      }
    }
  }
}