/**
 * STONEWALKER — Armory Global Tier Upgrades & Weapon Station Stock System (Section 8)
 * Prehistoric Tribes + Clash of Clans style: upgrading a troop's weapon or armor tier
 * at the Armory upgrades that troop role across the entire tribe.
 */

import type { EventBus } from '../core/EventBus';
import {
  ARMOR_TIERS,
  WEAPON_STATION_ITEMS,
  WEAPON_STATION_STOCK_CAPS,
  WEAPON_TIERS,
} from '../data/equipment';
import type {
  ArmorTier,
  BuildingEntity,
  FactionState,
  UnitRole,
  WeaponStationItemType,
  WeaponTier,
} from '../data/types';
import { ConstructionSystem } from './Construction';

export class EquipmentSystem {
  public static tryUpgradeUnitWeaponTier(
    role: UnitRole,
    factionState: FactionState,
    armoryBuilding: BuildingEntity | null,
    bus: EventBus,
  ): boolean {
    if (!armoryBuilding || !armoryBuilding.isConstructed) {
      bus.emit('ui:toast', {
        message: 'Build a Tribal Armory first to upgrade weapons!',
        level: 'warning',
      });
      return false;
    }

    const currentTier = factionState.unitWeaponTiers[role];
    if (currentTier >= 3) {
      return false;
    }
    const nextTier = (currentTier + 1) as WeaponTier;
    const tierDef = WEAPON_TIERS[nextTier];

    if (
      tierDef.requiredTech &&
      !factionState.researchedTechs.includes(tierDef.requiredTech)
    ) {
      bus.emit('ui:toast', {
        message: `Requires tech: ${tierDef.requiredTech.replace('_', ' ')}`,
        level: 'warning',
      });
      return false;
    }

    if (!ConstructionSystem.canAfford(factionState.resources, tierDef.upgradeCost)) {
      bus.emit('ui:toast', {
        message: `Not enough resources for ${tierDef.name}.`,
        level: 'warning',
      });
      return false;
    }

    ConstructionSystem.spendResources(factionState.resources, tierDef.upgradeCost);
    factionState.unitWeaponTiers[role] = nextTier;
    bus.emit('ui:toast', {
      message: `${role.replace('_', ' ')} upgraded to ${tierDef.name}!`,
      level: 'success',
    });
    return true;
  }

  public static tryUpgradeUnitArmorTier(
    role: UnitRole,
    factionState: FactionState,
    armoryBuilding: BuildingEntity | null,
    bus: EventBus,
  ): boolean {
    if (!armoryBuilding || !armoryBuilding.isConstructed) {
      bus.emit('ui:toast', {
        message: 'Build a Tribal Armory first to upgrade armor!',
        level: 'warning',
      });
      return false;
    }

    const currentTier = factionState.unitArmorTiers[role];
    if (currentTier >= 3) {
      return false;
    }
    const nextTier = (currentTier + 1) as ArmorTier;
    const tierDef = ARMOR_TIERS[nextTier];

    if (
      tierDef.requiredTech &&
      !factionState.researchedTechs.includes(tierDef.requiredTech)
    ) {
      bus.emit('ui:toast', {
        message: `Requires tech: ${tierDef.requiredTech.replace('_', ' ')}`,
        level: 'warning',
      });
      return false;
    }

    if (!ConstructionSystem.canAfford(factionState.resources, tierDef.upgradeCost)) {
      bus.emit('ui:toast', {
        message: `Not enough resources for ${tierDef.name}.`,
        level: 'warning',
      });
      return false;
    }

    ConstructionSystem.spendResources(factionState.resources, tierDef.upgradeCost);
    factionState.unitArmorTiers[role] = nextTier;
    bus.emit('ui:toast', {
      message: `${role.replace('_', ' ')} upgraded to ${tierDef.name}!`,
      level: 'success',
    });
    return true;
  }

  public static tryCraftWeaponStationItem(
    station: BuildingEntity,
    itemType: WeaponStationItemType,
    factionState: FactionState,
    bus: EventBus,
  ): boolean {
    if (station.buildingType !== 'weapon_station' || !station.isConstructed) {
      return false;
    }
    const cap =
      WEAPON_STATION_STOCK_CAPS[station.level - 1] ??
      WEAPON_STATION_STOCK_CAPS[0];
    const total =
      station.weaponStock.club +
      station.weaponStock.spear +
      station.weaponStock.sling;
    if (total >= cap) {
      bus.emit('ui:toast', {
        message: `Weapon Station stock full (${total}/${cap}).`,
        level: 'warning',
      });
      return false;
    }

    const def = WEAPON_STATION_ITEMS[itemType];
    if (!ConstructionSystem.canAfford(factionState.resources, def.cost)) {
      bus.emit('ui:toast', {
        message: `Not enough resources to craft ${def.name}.`,
        level: 'warning',
      });
      return false;
    }

    ConstructionSystem.spendResources(factionState.resources, def.cost);
    station.weaponStock[itemType] += 1;
    bus.emit('ui:toast', {
      message: `Crafted ${def.name} for emergency stock!`,
      level: 'success',
    });
    return true;
  }
}