/**
 * STONEWALKER — Base & Building Alarm Response System (Section 9)
 * - Strictly ignores same-faction units so a friendly unit or worker can NEVER trigger
 *   a Base Alarm against itself.
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import type {
  BuildingEntity,
  EntityId,
  FactionState,
  UnitEntity,
  Vec2,
  WeaponStationItemType,
} from '../data/types';
import type { WorldGrid } from '../world/Grid';
import { Pathfinder } from './Pathfinding';

export class AlarmResponseSystem {
  public static triggerAlarm(
    attackedBuilding: BuildingEntity,
    attackerId: EntityId,
    factionState: FactionState,
    units: Iterable<UnitEntity>,
    buildings: Iterable<BuildingEntity>,
    grid: WorldGrid,
    bus: EventBus,
  ): void {
    const unitList = Array.from(units);
    const attackerUnit = unitList.find((u) => u.id === attackerId);

    // Never trigger an alarm if the source is from the same faction
    if (attackerUnit && attackerUnit.faction === factionState.faction) {
      return;
    }

    const wasActive = factionState.alarmActive;
    factionState.alarmActive = true;
    factionState.alarmPosition = { ...attackedBuilding.position };
    factionState.alarmTimer = BALANCE.ALARM_CLEAR_DELAY_SECONDS;

    if (!wasActive) {
      bus.emit('alarm:triggered', {
        faction: factionState.faction,
        position: { ...attackedBuilding.position },
        buildingId: attackedBuilding.id,
      });
    }

    const isBase = attackedBuilding.buildingType === 'base';
    const alarmRadius = isBase
      ? BALANCE.BASE_ALARM_RADIUS_TILES
      : BALANCE.BUILDING_ALARM_RADIUS_TILES;
    const rSq = alarmRadius * alarmRadius;

    const stations = Array.from(buildings).filter(
      (b) =>
        b.hp > 0 &&
        b.isConstructed &&
        b.faction === factionState.faction &&
        b.buildingType === 'weapon_station',
    );

    for (const u of unitList) {
      if (u.hp <= 0 || u.isReviving || u.faction !== factionState.faction) {
        continue;
      }
      const dx = u.position.x - attackedBuilding.position.x;
      const dz = u.position.z - attackedBuilding.position.z;
      if (dx * dx + dz * dz > rSq) {
        continue;
      }

      if (u.role === 'worker') {
        if (!u.equippedEmergencyWeapon && stations.length > 0) {
          this.tryEquipWorkerFromStation(u, stations[0]!);
        }
        if (attackerUnit && attackerUnit.faction !== u.faction) {
          u.targetEntityId = attackerId;
          u.status = 'fighting';
          u.path = Pathfinder.findPath(
            grid,
            u.position,
            attackedBuilding.position,
          );
        }
      } else if (!u.targetEntityId && attackerUnit && attackerUnit.faction !== u.faction) {
        u.targetEntityId = attackerId;
        u.status = 'fighting';
        u.path = Pathfinder.findPath(
          grid,
          u.position,
          attackedBuilding.position,
        );
      }
    }
  }

  public static recallArmyToDefendBase(
    factionState: FactionState,
    units: Iterable<UnitEntity>,
    buildings: Iterable<BuildingEntity>,
    grid: WorldGrid,
  ): void {
    let basePos: Vec2 | null = null;
    for (const b of buildings) {
      if (
        b.hp > 0 &&
        b.faction === factionState.faction &&
        b.buildingType === 'base'
      ) {
        basePos = b.position;
        break;
      }
    }
    if (!basePos) {
      return;
    }

    let idx = 0;
    for (const u of units) {
      if (
        u.hp <= 0 ||
        u.isReviving ||
        u.faction !== factionState.faction ||
        u.role === 'worker'
      ) {
        continue;
      }
      const angle = (idx * Math.PI * 2) / 10;
      const guardSpot: Vec2 = {
        x: basePos.x + Math.cos(angle) * BALANCE.BASE_GUARD_RING_RADIUS_TILES,
        z: basePos.z + Math.sin(angle) * BALANCE.BASE_GUARD_RING_RADIUS_TILES,
      };
      u.targetEntityId = null;
      u.status = 'guarding';
      u.guardSpot = guardSpot;
      u.path = Pathfinder.findPath(grid, u.position, guardSpot);
      idx++;
    }
  }

  public static update(
    factionState: FactionState,
    units: Iterable<UnitEntity>,
    buildings: Iterable<BuildingEntity>,
    grid: WorldGrid,
    bus: EventBus,
    dt: number,
  ): void {
    if (!factionState.alarmActive) {
      return;
    }

    factionState.alarmTimer -= dt;
    if (factionState.alarmTimer > 0) {
      return;
    }

    factionState.alarmActive = false;
    factionState.alarmPosition = null;
    bus.emit('alarm:cleared', { faction: factionState.faction });

    const bldList = Array.from(buildings);
    const stations = bldList.filter(
      (b) =>
        b.hp > 0 &&
        b.isConstructed &&
        b.faction === factionState.faction &&
        b.buildingType === 'weapon_station',
    );

    for (const u of units) {
      if (u.hp <= 0 || u.faction !== factionState.faction) {
        continue;
      }
      if (u.role === 'worker') {
        if (u.equippedEmergencyWeapon && stations[0]) {
          stations[0].weaponStock[u.equippedEmergencyWeapon] += 1;
          u.equippedEmergencyWeapon = null;
        }
        u.targetEntityId = null;
        u.status = 'working';
        if (u.jobMemory.targetPosition) {
          u.path = Pathfinder.findPath(
            grid,
            u.position,
            u.jobMemory.targetPosition,
          );
        }
      } else if (u.status === 'fighting' && !u.targetEntityId) {
        u.status = 'guarding';
      }
    }
  }

  private static tryEquipWorkerFromStation(
    worker: UnitEntity,
    station: BuildingEntity,
  ): void {
    const order: WeaponStationItemType[] = ['spear', 'sling', 'club'];
    for (const item of order) {
      if (station.weaponStock[item] > 0) {
        station.weaponStock[item] -= 1;
        worker.equippedEmergencyWeapon = item;
        return;
      }
    }
  }
}