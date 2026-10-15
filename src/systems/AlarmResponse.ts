/**
 * STONEWALKER — Base & Camp Alarm Response + Weapon Station Pickup/Return (Sections 9B & 9D)
 * - When an enemy attacks the Base or ANY friendly building, an ALARM triggers.
 * - Every friendly unit within the alarm radius (Workers included) responds to fight.
 * - Workers check the nearest Weapon Station: if a ready weapon is in stock, the worker
 *   takes one (stock goes down) and attacks with that weapon's stats; otherwise throws stones.
 * - When the threat is gone for `ALARM_CLEAR_DELAY_SECONDS`, workers return their weapons
 *   to the Weapon Station (stock goes back up) and resume their previous job automatically.
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
    const wasAlreadyActive = factionState.alarmActive;
    factionState.alarmActive = true;
    factionState.alarmPosition = { ...attackedBuilding.position };
    factionState.alarmTimer = BALANCE.ALARM_CLEAR_DELAY_SECONDS;

    const alarmRadius =
      attackedBuilding.buildingType === 'base'
        ? BALANCE.BASE_ALARM_RADIUS_TILES
        : BALANCE.BUILDING_ALARM_RADIUS_TILES;
    const rSq = alarmRadius * alarmRadius;

    if (!wasAlreadyActive) {
      bus.emit('alarm:triggered', {
        faction: factionState.faction,
        position: { ...attackedBuilding.position },
        buildingId: attackedBuilding.id,
      });
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: 'CAMP UNDER ATTACK! All hands to defense!',
          level: 'danger',
          jumpTo: { ...attackedBuilding.position },
        });
      }
    }

    const buildingList = Array.from(buildings);

    for (const unit of units) {
      if (unit.hp <= 0 || unit.faction !== factionState.faction) {
        continue;
      }
      const dx = unit.position.x - attackedBuilding.position.x;
      const dz = unit.position.z - attackedBuilding.position.z;
      if (dx * dx + dz * dz > rSq) {
        continue;
      }

      if (unit.role === 'worker' && !unit.equippedEmergencyWeapon) {
        // Worker checks nearest Weapon Station to grab a physical weapon if stocked
        const station = this.findNearestStockedWeaponStation(
          unit.position,
          factionState.faction,
          buildingList,
        );
        if (station) {
          const taken = this.takeOneWeaponFromStation(station);
          if (taken) {
            unit.equippedEmergencyWeapon = taken;
          }
        }
      }

      unit.targetEntityId = attackerId;
      unit.status = 'fighting';
      unit.idleTimer = 0;
      unit.path = Pathfinder.findPath(
        grid,
        unit.position,
        attackedBuilding.position,
      );
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
    if (!factionState.alarmActive || !factionState.alarmPosition) {
      return;
    }

    const alarmPos = factionState.alarmPosition;
    const checkRadiusSq =
      BALANCE.BASE_ALARM_RADIUS_TILES * BALANCE.BASE_ALARM_RADIUS_TILES;

    let enemyStillPresent = false;
    for (const u of units) {
      if (u.hp > 0 && u.faction !== factionState.faction && u.faction !== 'neutral') {
        const dx = u.position.x - alarmPos.x;
        const dz = u.position.z - alarmPos.z;
        if (dx * dx + dz * dz <= checkRadiusSq) {
          enemyStillPresent = true;
          break;
        }
      }
    }

    if (enemyStillPresent) {
      factionState.alarmTimer = BALANCE.ALARM_CLEAR_DELAY_SECONDS;
      return;
    }

    factionState.alarmTimer -= dt;
    if (factionState.alarmTimer > 0) {
      return;
    }

    // Threat cleared -> return worker emergency weapons and resume previous jobs
    factionState.alarmActive = false;
    factionState.alarmPosition = null;
    bus.emit('alarm:cleared', { faction: factionState.faction });

    const buildingList = Array.from(buildings);
    const station = this.findAnyWeaponStation(factionState.faction, buildingList);

    let guardIdx = 0;
    const baseBld = buildingList.find(
      (b) => b.faction === factionState.faction && b.buildingType === 'base' && b.hp > 0,
    );

    for (const unit of units) {
      if (unit.hp <= 0 || unit.faction !== factionState.faction) {
        continue;
      }

      if (unit.role === 'worker') {
        if (unit.equippedEmergencyWeapon) {
          if (station) {
            station.weaponStock[unit.equippedEmergencyWeapon] += 1;
          }
          unit.equippedEmergencyWeapon = null;
        }
        unit.targetEntityId = null;
        if (unit.jobMemory.jobType !== 'none' && unit.jobMemory.targetPosition) {
          unit.status = 'working';
          unit.path = Pathfinder.findPath(
            grid,
            unit.position,
            unit.jobMemory.targetPosition,
          );
        } else {
          unit.status = 'idle';
        }
      } else {
        unit.targetEntityId = null;
        unit.status = 'guarding';
        const spot =
          unit.guardSpot ??
          (baseBld
            ? grid.computeGuardSpotAroundBase(
                baseBld.position,
                guardIdx++,
                unit.kind === 'machine' ? 2 : 1,
              )
            : null);
        if (spot) {
          unit.guardSpot = spot;
          unit.path = Pathfinder.findPath(grid, unit.position, spot);
        }
      }
    }
  }

  /**
   * Section 9D: DEFEND BASE button recalls all troops and machines to their guard spots
   * near the Base. Workers are not recalled unless an alarm is active.
   */
  public static recallArmyToDefendBase(
    factionState: FactionState,
    units: Iterable<UnitEntity>,
    buildings: Iterable<BuildingEntity>,
    grid: WorldGrid,
  ): void {
    let baseBld: BuildingEntity | null = null;
    for (const b of buildings) {
      if (
        b.hp > 0 &&
        b.faction === factionState.faction &&
        b.buildingType === 'base'
      ) {
        baseBld = b;
        break;
      }
    }
    if (!baseBld) {
      return;
    }

    let slotIdx = 0;
    for (const unit of units) {
      if (unit.hp <= 0 || unit.faction !== factionState.faction) {
        continue;
      }
      if (unit.role === 'worker' && !factionState.alarmActive) {
        continue;
      }
      const fp = unit.kind === 'machine' ? 2 : 1;
      const spot = grid.computeGuardSpotAroundBase(
        baseBld.position,
        slotIdx++,
        fp,
      );
      unit.guardSpot = spot;
      unit.targetEntityId = null;
      unit.status = 'guarding';
      unit.idleTimer = 0;
      unit.path = Pathfinder.findPath(grid, unit.position, spot, {
        footprint: fp,
        ignoreEntityId: unit.id,
      });
    }
  }

  private static findNearestStockedWeaponStation(
    origin: Vec2,
    faction: string,
    buildings: readonly BuildingEntity[],
  ): BuildingEntity | null {
    let best: BuildingEntity | null = null;
    let bestDistSq = Infinity;

    for (const b of buildings) {
      if (
        b.hp <= 0 ||
        !b.isConstructed ||
        b.faction !== faction ||
        b.buildingType !== 'weapon_station'
      ) {
        continue;
      }
      const total =
        b.weaponStock.club + b.weaponStock.spear + b.weaponStock.sling;
      if (total <= 0) {
        continue;
      }
      const dx = b.position.x - origin.x;
      const dz = b.position.z - origin.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = b;
      }
    }
    return best;
  }

  private static findAnyWeaponStation(
    faction: string,
    buildings: readonly BuildingEntity[],
  ): BuildingEntity | null {
    return (
      buildings.find(
        (b) =>
          b.hp > 0 &&
          b.isConstructed &&
          b.faction === faction &&
          b.buildingType === 'weapon_station',
      ) ?? null
    );
  }

  private static takeOneWeaponFromStation(
    station: BuildingEntity,
  ): WeaponStationItemType | null {
    if (station.weaponStock.spear > 0) {
      station.weaponStock.spear -= 1;
      return 'spear';
    }
    if (station.weaponStock.sling > 0) {
      station.weaponStock.sling -= 1;
      return 'sling';
    }
    if (station.weaponStock.club > 0) {
      station.weaponStock.club -= 1;
      return 'club';
    }
    return null;
  }
}