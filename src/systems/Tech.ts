/**
 * STONEWALKER — Technology Research & Effect Application System (Section 13)
 * Researches the 20 techs across Stone, Bone, and Bronze ages and applies
 * immediate faction-wide upgrades (Base tiers, building HP, equipment tiers, Spirit Powers).
 */

import type { EventBus } from '../core/EventBus';
import { BASE_TIER_STATS } from '../data/buildings';
import { TECHS } from '../data/techs';
import type {
  ArmorTier,
  BuildingEntity,
  FactionState,
  TechDefinition,
  WeaponTier,
} from '../data/types';
import { ConstructionSystem } from './Construction';

export class TechSystem {
  public static canResearch(
    techId: string,
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
  ): { ok: boolean; reason?: string } {
    const def = TECHS[techId];
    if (!def) {
      return { ok: false, reason: 'Unknown technology' };
    }
    if (factionState.researchedTechs.includes(techId)) {
      return { ok: false, reason: 'Already researched' };
    }
    if (factionState.activeResearch) {
      return { ok: false, reason: 'Research already in progress' };
    }

    let hasResearchHall = false;
    for (const b of buildings) {
      if (
        b.hp > 0 &&
        b.isConstructed &&
        b.faction === factionState.faction &&
        (b.buildingType === 'research_hall' || b.buildingType === 'base')
      ) {
        hasResearchHall = true;
        break;
      }
    }
    if (!hasResearchHall) {
      return { ok: false, reason: 'Requires a Research Hall' };
    }

    if (
      def.prerequisite &&
      !factionState.researchedTechs.includes(def.prerequisite)
    ) {
      const preName = TECHS[def.prerequisite]?.name ?? def.prerequisite;
      return { ok: false, reason: `Requires ${preName}` };
    }

    if (!ConstructionSystem.canAfford(factionState.resources, def.cost)) {
      return { ok: false, reason: 'Not enough resources' };
    }

    return { ok: true };
  }

  public static startResearch(
    techId: string,
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
    bus: EventBus,
  ): boolean {
    const check = this.canResearch(techId, factionState, buildings);
    if (!check.ok) {
      if (factionState.faction === 'player' && check.reason) {
        bus.emit('ui:toast', {
          message: check.reason,
          level: 'warning',
        });
      }
      return false;
    }

    const def = TECHS[techId]!;
    ConstructionSystem.spendResources(factionState.resources, def.cost);
    factionState.activeResearch = {
      itemType: techId,
      progress: 0,
      totalTime: def.researchTime,
    };

    if (factionState.faction === 'player') {
      bus.emit('ui:toast', {
        message: `Started researching ${def.name}...`,
        level: 'info',
      });
    }
    return true;
  }

  public static update(
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
    starvationMultiplier: number,
    bus: EventBus,
    dt: number,
  ): void {
    if (!factionState.activeResearch) {
      return;
    }

    factionState.activeResearch.progress += dt * starvationMultiplier;
    if (
      factionState.activeResearch.progress <
      factionState.activeResearch.totalTime
    ) {
      return;
    }

    const techId = factionState.activeResearch.itemType;
    factionState.activeResearch = null;

    if (!factionState.researchedTechs.includes(techId)) {
      factionState.researchedTechs.push(techId);
    }

    const def = TECHS[techId];
    if (def) {
      this.applyTechEffect(def, factionState, buildings);
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Research Complete: ${def.name}!`,
          level: 'success',
        });
      }
    }
  }

  public static applyTechEffect(
    def: TechDefinition,
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
  ): void {
    const eff = def.effect;
    if (eff.type === 'unlock_equipment_tier') {
      const tier = Math.min(3, Math.max(0, eff.value)) as WeaponTier &
        ArmorTier;
      if (tier > factionState.unlockedWeaponTier) {
        factionState.unlockedWeaponTier = tier;
      }
      if (tier > factionState.unlockedArmorTier) {
        factionState.unlockedArmorTier = tier;
      }
    } else if (eff.type === 'building_hp') {
      for (const b of buildings) {
        if (b.hp > 0 && b.faction === factionState.faction) {
          const boost = Math.round(b.maxHp * eff.value);
          b.maxHp += boost;
          b.hp += boost;
        }
      }
    } else if (eff.type === 'base_upgrade') {
      const targetLevel = Math.min(3, Math.max(1, eff.value));
      const tierStats =
        BASE_TIER_STATS[targetLevel - 1] ?? BASE_TIER_STATS[0]!;
      for (const b of buildings) {
        if (
          b.hp > 0 &&
          b.faction === factionState.faction &&
          b.buildingType === 'base' &&
          b.level < targetLevel
        ) {
          b.level = targetLevel;
          b.maxHp = tierStats.maxHp;
          b.hp = tierStats.maxHp;
        }
      }
    }
  }
}