/**
 * STONEWALKER — Spirit Powers, Hero Active Ability & Spirit Totem Revival System (Section 8B)
 * - Spirit Powers: Healing Rain, Rally Roar, Fire Rain, Earthquake (cooldown-based, zero resource cost).
 * - Chieftain Hero Ability: Earthshatter Slam, Tempest War Cry, Pyre Wave.
 * - Hero Revival: If a Hero falls, they revive at the faction's Spirit Totem (or Base) after cooldown.
 * - Handles the edge case where a Hero dies mid-cast gracefully without crashing.
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import { HEROES } from '../data/heroes';
import { SPIRIT_POWERS } from '../data/powers';
import type {
  BuildingEntity,
  EntityId,
  FactionState,
  SpiritPowerId,
  UnitEntity,
  Vec2,
} from '../data/types';
import type { WorldGrid } from '../world/Grid';
import { CombatSystem } from './Combat';

export interface ActivePowerZone {
  id: string;
  powerId: SpiritPowerId;
  faction: FactionState['faction'];
  position: Vec2;
  radius: number;
  remainingSec: number;
  totalDurationSec: number;
}

export class PowersSystem {
  public static isPowerUnlocked(
    powerId: SpiritPowerId,
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
  ): boolean {
    const def = SPIRIT_POWERS[powerId];
    if (
      def.requiredTech &&
      !factionState.researchedTechs.includes(def.requiredTech)
    ) {
      return false;
    }
    // Healing Rain is available as soon as a Spirit Totem is constructed (or in Level 4+)
    for (const b of buildings) {
      if (
        b.hp > 0 &&
        b.isConstructed &&
        b.faction === factionState.faction &&
        (b.buildingType === 'spirit_totem' || b.buildingType === 'base')
      ) {
        return true;
      }
    }
    return false;
  }

  public static canCastSpiritPower(
    powerId: SpiritPowerId,
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
  ): boolean {
    if (!this.isPowerUnlocked(powerId, factionState, buildings)) {
      return false;
    }
    return (factionState.powerCooldowns[powerId] ?? 0) <= 0;
  }

  public static castSpiritPower(
    powerId: SpiritPowerId,
    targetPos: Vec2,
    factionState: FactionState,
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    factionById: ReadonlyMap<string, FactionState>,
    activeZones: ActivePowerZone[],
    grid: WorldGrid,
    bus: EventBus,
  ): boolean {
    if (!this.canCastSpiritPower(powerId, factionState, buildings.values())) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: 'Spirit Power is still recharging or locked.',
          level: 'warning',
        });
      }
      return false;
    }

    const def = SPIRIT_POWERS[powerId];
    factionState.powerCooldowns[powerId] = def.cooldown;

    const rSq = def.radius * def.radius;

    // Apply immediate burst effects for Fire Rain and Earthquake
    if (powerId === 'fire_rain' || powerId === 'earthquake') {
      const dmgType = powerId === 'fire_rain' ? 'fire' : 'siege';
      const causesFire = powerId === 'fire_rain';

      for (const u of units.values()) {
        if (
          u.hp <= 0 ||
          u.faction === factionState.faction ||
          u.faction === 'neutral'
        ) {
          continue;
        }
        const dx = u.position.x - targetPos.x;
        const dz = u.position.z - targetPos.z;
        if (dx * dx + dz * dz <= rSq) {
          CombatSystem.applyDirectDamage(
            `power_${powerId}`,
            u.id,
            def.value,
            dmgType,
            causesFire,
            units,
            buildings,
            factionById,
            grid,
            bus,
          );
        }
      }

      for (const b of buildings.values()) {
        if (
          b.hp <= 0 ||
          b.faction === factionState.faction ||
          b.faction === 'neutral'
        ) {
          continue;
        }
        const dx = b.position.x - targetPos.x;
        const dz = b.position.z - targetPos.z;
        if (dx * dx + dz * dz <= rSq) {
          CombatSystem.applyDirectDamage(
            `power_${powerId}`,
            b.id,
            def.value,
            dmgType,
            causesFire,
            units,
            buildings,
            factionById,
            grid,
            bus,
          );
        }
      }
    }

    activeZones.push({
      id: `zone_${powerId}_${Date.now()}`,
      powerId,
      faction: factionState.faction,
      position: { x: targetPos.x, z: targetPos.z },
      radius: def.radius,
      remainingSec: def.duration,
      totalDurationSec: def.duration,
    });

    bus.emit('power:cast', {
      powerId,
      faction: factionState.faction,
      position: { x: targetPos.x, z: targetPos.z },
    });

    if (factionState.faction === 'player') {
      bus.emit('ui:toast', {
        message: `${def.name} unleashed!`,
        level: 'success',
      });
    }
    return true;
  }

  /**
   * Triggers the Chieftain Hero's active ability (Section 8B).
   * Safe against the edge case where the hero is dead/reviving.
   */
  public static castHeroAbility(
    hero: UnitEntity | null,
    factionState: FactionState,
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    factionById: ReadonlyMap<string, FactionState>,
    grid: WorldGrid,
    bus: EventBus,
  ): boolean {
    if (!hero || hero.hp <= 0 || hero.isReviving) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: 'Chieftain Hero is reviving at the Spirit Totem.',
          level: 'warning',
        });
      }
      return false;
    }

    if (hero.heroAbilityCooldownTimer > 0) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Hero ability ready in ${Math.ceil(hero.heroAbilityCooldownTimer)}s.`,
          level: 'info',
        });
      }
      return false;
    }

    const heroDef = HEROES[factionState.tribe];
    hero.heroAbilityCooldownTimer = heroDef.abilityCooldown;
    const rSq = heroDef.abilityRadius * heroDef.abilityRadius;

    if (factionState.tribe === 'reef_clan') {
      // Tempest War Cry: heals & grants shield + speed boost to nearby allies
      for (const ally of units.values()) {
        if (ally.hp <= 0 || ally.faction !== hero.faction) {
          continue;
        }
        const dx = ally.position.x - hero.position.x;
        const dz = ally.position.z - hero.position.z;
        if (dx * dx + dz * dz <= rSq) {
          ally.hp = Math.min(ally.maxHp, ally.hp + 65);
          ally.shieldHp = Math.min(100, ally.shieldHp + 45);
        }
      }
    } else {
      // Stonebacks Earthshatter Slam or Ember Tribe Pyre Wave
      const dmg = factionState.tribe === 'ember_tribe' ? 135 : 110;
      const dmgType = factionState.tribe === 'ember_tribe' ? 'fire' : 'siege';
      for (const enemy of units.values()) {
        if (
          enemy.hp <= 0 ||
          enemy.faction === hero.faction ||
          enemy.faction === 'neutral'
        ) {
          continue;
        }
        const dx = enemy.position.x - hero.position.x;
        const dz = enemy.position.z - hero.position.z;
        if (dx * dx + dz * dz <= rSq) {
          enemy.path = [];
          enemy.attackCooldownTimer = Math.max(
            enemy.attackCooldownTimer,
            3.0,
          );
          CombatSystem.applyDirectDamage(
            hero.id,
            enemy.id,
            dmg,
            dmgType,
            dmgType === 'fire',
            units,
            buildings,
            factionById,
            grid,
            bus,
          );
        }
      }
    }

    if (factionState.faction === 'player') {
      bus.emit('ui:toast', {
        message: `${heroDef.name}: ${heroDef.abilityName}!`,
        level: 'success',
      });
    }
    return true;
  }

  public static update(
    factionById: ReadonlyMap<string, FactionState>,
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    activeZones: ActivePowerZone[],
    bus: EventBus,
    dt: number,
  ): void {
    // 1. Tick Spirit Power Cooldowns
    for (const fState of factionById.values()) {
      const powerIds: SpiritPowerId[] = [
        'healing_rain',
        'rally_roar',
        'fire_rain',
        'earthquake',
      ];
      for (const pid of powerIds) {
        if (fState.powerCooldowns[pid] > 0) {
          fState.powerCooldowns[pid] = Math.max(
            0,
            fState.powerCooldowns[pid] - dt,
          );
        }
      }
    }

    // 2. Tick Active Zones (Healing Rain continuous heal)
    for (let i = activeZones.length - 1; i >= 0; i--) {
      const zone = activeZones[i]!;
      zone.remainingSec -= dt;
      if (zone.remainingSec <= 0) {
        activeZones.splice(i, 1);
        continue;
      }

      if (zone.powerId === 'healing_rain') {
        const def = SPIRIT_POWERS.healing_rain;
        const healPerSec = def.value / Math.max(1, def.duration);
        const rSq = zone.radius * zone.radius;
        for (const u of units.values()) {
          if (u.hp > 0 && u.faction === zone.faction) {
            const dx = u.position.x - zone.position.x;
            const dz = u.position.z - zone.position.z;
            if (dx * dx + dz * dz <= rSq) {
              u.hp = Math.min(u.maxHp, u.hp + healPerSec * dt);
            }
          }
        }
      }
    }

    // 3. Tick Hero Ability Cooldowns & Spirit Totem Revival
    for (const u of units.values()) {
      if (u.kind !== 'hero') {
        continue;
      }
      if (u.heroAbilityCooldownTimer > 0) {
        u.heroAbilityCooldownTimer = Math.max(
          0,
          u.heroAbilityCooldownTimer - dt,
        );
      }

      if (u.hp <= 0 && !u.isReviving) {
        const fState = factionById.get(u.faction);
        const tribe = fState?.tribe ?? 'stonebacks';
        u.isReviving = true;
        u.reviveTimer = HEROES[tribe].reviveTime;
        u.path = [];
        u.targetEntityId = null;
      }

      if (u.isReviving) {
        u.reviveTimer -= dt;
        if (u.reviveTimer <= 0) {
          const totemOrBase = this.findRevivalMonument(
            u.faction,
            buildings.values(),
          );
          if (totemOrBase) {
            u.isReviving = false;
            u.hp = u.maxHp;
            u.position = {
              x: totemOrBase.position.x + 2.2,
              z: totemOrBase.position.z + 2.2,
            };
            if (u.faction === 'player') {
              bus.emit('ui:toast', {
                message: 'Your Chieftain Hero has revived at the Spirit Totem!',
                level: 'success',
                jumpTo: u.position,
              });
            }
          } else {
            u.reviveTimer = 5; // Wait until a Spirit Totem or Base exists
          }
        }
      }
    }
  }

  public static getZoneRallyBonusMultiplier(
    unit: UnitEntity,
    activeZones: readonly ActivePowerZone[],
  ): number {
    for (const z of activeZones) {
      if (z.powerId === 'rally_roar' && z.faction === unit.faction) {
        const dx = unit.position.x - z.position.x;
        const dz = unit.position.z - z.position.z;
        if (dx * dx + dz * dz <= z.radius * z.radius) {
          return 1 + SPIRIT_POWERS.rally_roar.value;
        }
      }
    }
    return 1.0;
  }

  private static findRevivalMonument(
    faction: string,
    buildings: Iterable<BuildingEntity>,
  ): BuildingEntity | null {
    let fallbackBase: BuildingEntity | null = null;
    for (const b of buildings) {
      if (b.hp <= 0 || !b.isConstructed || b.faction !== faction) {
        continue;
      }
      if (b.buildingType === 'spirit_totem') {
        return b;
      }
      if (b.buildingType === 'base') {
        fallbackBase = b;
      }
    }
    return fallbackBase;
  }
}

export const HERO_REVIVE_COOLDOWN_HINT = BALANCE.UNIT_IDLE_TIMEOUT_SECONDS;