/**
 * STONEWALKER — Housing, Storage Cap & Food Upkeep System (Sections 6 & 7)
 * Recomputes population caps from constructed Huts and Bases, storage caps from
 * Storage Pits and Bases, and applies troop Food upkeep over time.
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import { BASE_TIER_STATS, BUILDINGS } from '../data/buildings';
import { MACHINES } from '../data/machines';
import { UNITS } from '../data/units';
import type {
  BuildingEntity,
  FactionState,
  ResourceType,
  UnitEntity,
} from '../data/types';

export class HousingSystem {
  /**
   * Recomputes `populationUsed`, `populationCap`, and `storageCaps` for a faction.
   */
  public static recomputeCaps(
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
    units: Iterable<UnitEntity>,
  ): void {
    let popCap = 0;
    const storageCaps = { ...BALANCE.BASE_STORAGE_CAP };

    for (const bld of buildings) {
      if (
        bld.hp <= 0 ||
        !bld.isConstructed ||
        bld.faction !== factionState.faction
      ) {
        continue;
      }

      if (bld.buildingType === 'base') {
        const tier = BASE_TIER_STATS[bld.level - 1] ?? BASE_TIER_STATS[0]!;
        popCap += tier.housingProvided;
        const capBonus = (bld.level - 1) * 250;
        storageCaps.food += capBonus;
        storageCaps.wood += capBonus;
        storageCaps.stone += capBonus;
        storageCaps.hide += capBonus;
        storageCaps.bronze += capBonus;
      } else {
        const def = BUILDINGS[bld.buildingType];
        popCap += def.housingProvided * bld.level;
        if (def.storageBonus) {
          const mult = bld.level;
          storageCaps.food += (def.storageBonus.food ?? 0) * mult;
          storageCaps.wood += (def.storageBonus.wood ?? 0) * mult;
          storageCaps.stone += (def.storageBonus.stone ?? 0) * mult;
          storageCaps.hide += (def.storageBonus.hide ?? 0) * mult;
          storageCaps.bronze += (def.storageBonus.bronze ?? 0) * mult;
        }
      }
    }

    let popUsed = 0;
    for (const u of units) {
      if (u.hp <= 0 || u.faction !== factionState.faction) {
        continue;
      }
      if (u.kind === 'unit') {
        popUsed += UNITS[u.role as keyof typeof UNITS]?.popCost ?? 1;
      } else if (u.kind === 'machine') {
        popUsed += MACHINES[u.role as keyof typeof MACHINES]?.popCost ?? 0;
      } else if (u.kind === 'beast') {
        popUsed += 2;
      }
    }

    factionState.populationCap = Math.max(12, popCap);
    factionState.populationUsed = popUsed;
    factionState.storageCaps = storageCaps;

    // Clamp current resources to storage caps
    const types: ResourceType[] = ['food', 'wood', 'stone', 'hide', 'bronze'];
    for (const t of types) {
      if (factionState.resources[t] > storageCaps[t]) {
        factionState.resources[t] = storageCaps[t];
      }
    }
  }

  /**
   * Consumes troop Food upkeep and returns the production speed multiplier
   * (1.0 normally, or 0.45 when Food hits zero per Section 7).
   */
  public static updateUpkeep(
    factionState: FactionState,
    units: Iterable<UnitEntity>,
    bus: EventBus,
    dt: number,
  ): number {
    let upkeepPerMin = 0;
    for (const u of units) {
      if (u.hp <= 0 || u.faction !== factionState.faction) {
        continue;
      }
      if (u.kind === 'unit') {
        upkeepPerMin +=
          UNITS[u.role as keyof typeof UNITS]?.foodUpkeepPerMin ?? 0;
      } else if (u.kind === 'machine') {
        upkeepPerMin +=
          MACHINES[u.role as keyof typeof MACHINES]?.foodUpkeepPerMin ?? 0;
      }
    }

    const foodConsumed = (upkeepPerMin / 60) * dt;
    const prevFood = factionState.resources.food;
    factionState.resources.food = Math.max(0, prevFood - foodConsumed);

    if (prevFood > 0 && factionState.resources.food <= 0 && factionState.faction === 'player') {
      bus.emit('ui:toast', {
        message: 'Food stores empty! Production slowed — assign Workers to Food.',
        level: 'warning',
      });
    }

    return factionState.resources.food > 0
      ? 1.0
      : BALANCE.STARVATION_PRODUCTION_SPEED_MULTIPLIER;
  }
}