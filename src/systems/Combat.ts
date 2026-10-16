/**
 * STONEWALKER — Real-Time Combat, Base Weapons, Projectiles & Auto-Heal System
 * - Enforces strict friendly-fire protection: units and workers can NEVER attack or
 *   trigger alarms on same-faction units or buildings.
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import { BEASTS } from '../data/beasts';
import { BUILDINGS } from '../data/buildings';
import { ARMOR_TIERS, WEAPON_TIERS } from '../data/equipment';
import { HEROES, TRIBES } from '../data/heroes';
import { MACHINES } from '../data/machines';
import { UNITS } from '../data/units';
import type {
  ArmorType,
  BuildingEntity,
  DamageType,
  EntityId,
  FactionState,
  ProjectileEntity,
  UnitEntity,
  UnitRole,
  Vec2,
} from '../data/types';
import { getBaseEffectiveStats } from '../entities/Base';
import { createProjectileEntity } from '../entities/Projectile';
import type { WorldGrid } from '../world/Grid';
import { AlarmResponseSystem } from './AlarmResponse';
import { Pathfinder } from './Pathfinding';
import { TerrainSystem } from './Terrain';
import { VeterancySystem } from './Veterancy';

export class CombatSystem {
  private static readonly timeSinceDamaged = new Map<EntityId, number>();

  private static getCombatConfig(faction: string) {
    return faction === 'player'
      ? BALANCE.PLAYER_COMBAT
      : BALANCE.ENEMY_COMBAT;
  }

  public static markEntityDamaged(id: EntityId): void {
    this.timeSinceDamaged.set(id, 0);
  }

  public static update(
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    projectiles: Map<EntityId, ProjectileEntity>,
    factionById: ReadonlyMap<string, FactionState>,
    grid: WorldGrid,
    weatherFireMultiplier: number,
    bus: EventBus,
    dt: number,
  ): void {
    // 1. Update Units (Out-of-Combat Auto-Heal, Shaman Heal & Attacks)
    for (const attacker of units.values()) {
      if (attacker.hp <= 0 || attacker.isReviving) {
        continue;
      }

      const combatCfg = this.getCombatConfig(attacker.faction);
      const quietSec =
        (this.timeSinceDamaged.get(attacker.id) ??
          combatCfg.OUT_OF_COMBAT_HEAL_DELAY_SECONDS) + dt;
      this.timeSinceDamaged.set(attacker.id, quietSec);
      if (
        attacker.hp < attacker.maxHp &&
        quietSec >= combatCfg.OUT_OF_COMBAT_HEAL_DELAY_SECONDS
      ) {
        attacker.hp = Math.min(
          attacker.maxHp,
          attacker.hp + combatCfg.UNIT_AUTO_HEAL_HP_PER_SEC * dt,
        );
      }

      if (attacker.attackCooldownTimer > 0) {
        attacker.attackCooldownTimer = Math.max(
          0,
          attacker.attackCooldownTimer - dt,
        );
      }

      if (attacker.role === 'shaman') {
        this.updateShamanHeal(attacker, units, dt);
        continue;
      }

      if (!attacker.targetEntityId) {
        continue;
      }

      const targetUnit = units.get(attacker.targetEntityId);
      const targetBuilding = buildings.get(attacker.targetEntityId);

      // STRICT FRIENDLY-FIRE GUARD: Never allow any unit or worker to attack its own faction!
      if (
        (targetUnit && targetUnit.faction === attacker.faction) ||
        (targetBuilding && targetBuilding.faction === attacker.faction)
      ) {
        attacker.targetEntityId = null;
        if (attacker.status === 'fighting') {
          attacker.status = attacker.role === 'worker' ? 'working' : 'guarding';
        }
        continue;
      }

      const taunter = this.findNearbyEnemyShieldBearer(attacker, units);
      if (taunter) {
        attacker.targetEntityId = taunter.id;
      }

      if (
        (!targetUnit || targetUnit.hp <= 0) &&
        (!targetBuilding || targetBuilding.hp <= 0)
      ) {
        attacker.targetEntityId = null;
        if (attacker.status === 'fighting') {
          attacker.status = 'guarding';
        }
        continue;
      }

      const targetPos: Vec2 = targetUnit
        ? targetUnit.position
        : targetBuilding!.position;
      const targetRadius = targetBuilding
        ? targetBuilding.footprint * 0.5 + 0.5
        : 0.6;

      const factionState = factionById.get(attacker.faction);
      const stats = this.getAttackerCombatStats(
        attacker,
        factionState,
        grid,
        weatherFireMultiplier,
      );

      const dist =
        Math.hypot(
          targetPos.x - attacker.position.x,
          targetPos.z - attacker.position.z,
        ) - targetRadius;

      if (dist <= stats.range) {
        attacker.path = [];
        attacker.status = 'fighting';
        attacker.rotation = Math.atan2(
          targetPos.x - attacker.position.x,
          targetPos.z - attacker.position.z,
        );

        if (attacker.attackCooldownTimer <= 0) {
          attacker.attackCooldownTimer = stats.cooldown;
          if (stats.range > 2.5) {
            const proj = createProjectileEntity({
              sourceId: attacker.id,
              faction: attacker.faction,
              position: { ...attacker.position },
              targetPosition: { ...targetPos },
              targetEntityId: attacker.targetEntityId,
              speed: 14,
              damage: stats.damage,
              damageType: stats.damageType,
              splashRadius: attacker.role === 'fire_catapult' ? 2.4 : 0,
              causesFire: stats.damageType === 'fire',
            });
            projectiles.set(proj.id, proj);
          } else {
            this.applyDirectDamage(
              attacker.id,
              attacker.targetEntityId,
              stats.damage,
              stats.damageType,
              stats.damageType === 'fire',
              units,
              buildings,
              factionById,
              grid,
              bus,
            );
          }
        }
      } else if (
        attacker.stance !== 'hold_position' &&
        attacker.path.length === 0
      ) {
        attacker.path = Pathfinder.findPath(
          grid,
          attacker.position,
          targetPos,
          {
            footprint: 1,
            ignoreEntityId: attacker.id,
          },
        );
      }
    }

    // 2. Update Buildings (Fire DoT, Out-of-Combat Auto-Heal & Base Auto-Defense)
    for (const bld of buildings.values()) {
      if (bld.hp <= 0) {
        continue;
      }

      const bldCombatCfg = this.getCombatConfig(bld.faction);

      if (bld.fireBurnTimer > 0) {
        bld.fireBurnTimer = Math.max(0, bld.fireBurnTimer - dt);
        this.markEntityDamaged(bld.id);
        bld.hp = Math.max(
          0,
          bld.hp -
            BALANCE.BUILDING_FIRE_DOT_PER_SEC * weatherFireMultiplier * dt,
        );
        if (bld.hp <= 0) {
          grid.setBuildingFootprint(bld.tile, bld.footprint, null);
          continue;
        }
      } else if (bld.isConstructed) {
        const bldQuietSec =
          (this.timeSinceDamaged.get(bld.id) ??
            bldCombatCfg.OUT_OF_COMBAT_HEAL_DELAY_SECONDS) + dt;
        this.timeSinceDamaged.set(bld.id, bldQuietSec);
        if (
          bld.hp < bld.maxHp &&
          bldQuietSec >= bldCombatCfg.OUT_OF_COMBAT_HEAL_DELAY_SECONDS
        ) {
          bld.hp = Math.min(
            bld.maxHp,
            bld.hp + bldCombatCfg.BUILDING_AUTO_HEAL_HP_PER_SEC * dt,
          );
        }
      }

      if (bld.buildingType !== 'base' || !bld.isConstructed) {
        continue;
      }

      if (bld.attackCooldownTimer > 0) {
        bld.attackCooldownTimer = Math.max(0, bld.attackCooldownTimer - dt);
        continue;
      }

      const factionState = factionById.get(bld.faction);
      const tribe = factionState?.tribe ?? 'stonebacks';
      const baseStats = getBaseEffectiveStats(bld, tribe);

      const nearestEnemy = this.findNearestEnemyInRange(
        bld.position,
        baseStats.attackRange,
        bld.faction,
        units,
        buildings,
      );
      if (nearestEnemy) {
        bld.attackCooldownTimer = baseStats.attackCooldown;
        const proj = createProjectileEntity({
          sourceId: bld.id,
          faction: bld.faction,
          position: { ...bld.position },
          targetPosition: { ...nearestEnemy.position },
          targetEntityId: nearestEnemy.id,
          speed: 16,
          damage: Math.round(
            baseStats.attackDamage * bldCombatCfg.DAMAGE_MULTIPLIER,
          ),
          damageType: 'pierce',
          splashRadius: 1.2,
          causesFire: bld.level >= 2,
        });
        projectiles.set(proj.id, proj);
      }
    }

    // 3. Advance Projectiles
    for (const [id, proj] of projectiles.entries()) {
      const dx = proj.targetPosition.x - proj.position.x;
      const dz = proj.targetPosition.z - proj.position.z;
      const dist = Math.hypot(dx, dz);
      const step = proj.speed * dt;

      if (dist <= step) {
        if (proj.targetEntityId) {
          this.applyDirectDamage(
            proj.sourceId,
            proj.targetEntityId,
            proj.damage,
            proj.damageType,
            proj.causesFire,
            units,
            buildings,
            factionById,
            grid,
            bus,
          );
        }
        projectiles.delete(id);
      } else {
        proj.position.x += (dx / dist) * step;
        proj.position.z += (dz / dist) * step;
      }
    }
  }

  public static applyDirectDamage(
    sourceId: EntityId,
    targetId: EntityId,
    rawDamage: number,
    damageType: DamageType,
    causesFire: boolean,
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    factionById: ReadonlyMap<string, FactionState>,
    grid: WorldGrid,
    bus: EventBus,
  ): void {
    const attackerUnit = units.get(sourceId);
    const attackerBld = buildings.get(sourceId);
    const attackerFaction = attackerUnit?.faction ?? attackerBld?.faction;

    const targetUnit = units.get(targetId);
    if (targetUnit && targetUnit.hp > 0) {
      // Never damage same-faction units
      if (attackerFaction && attackerFaction === targetUnit.faction) {
        return;
      }
      this.markEntityDamaged(targetId);

      const targetFaction = factionById.get(targetUnit.faction);
      const { armorType, armorValue } = this.getTargetArmor(
        targetUnit,
        targetFaction,
      );
      const counterMult =
        BALANCE.DAMAGE_COUNTER_MATRIX[damageType][armorType] ?? 1.0;
      const mitigated = Math.max(
        1,
        Math.round(rawDamage * counterMult - armorValue * 0.45),
      );

      if (targetUnit.shieldHp > 0) {
        const absorbed = Math.min(targetUnit.shieldHp, mitigated);
        targetUnit.shieldHp -= absorbed;
        targetUnit.hp = Math.max(0, targetUnit.hp - (mitigated - absorbed));
      } else {
        targetUnit.hp = Math.max(0, targetUnit.hp - mitigated);
      }

      if (targetUnit.hp <= 0) {
        this.timeSinceDamaged.delete(targetUnit.id);
        if (attackerUnit) {
          VeterancySystem.recordKill(attackerUnit);
          const atkFaction = factionById.get(attackerUnit.faction);
          if (atkFaction) {
            atkFaction.enemiesDefeated += 1;
          }
        }
        if (targetFaction) {
          targetFaction.unitsLost += 1;
        }
        targetUnit.equippedEmergencyWeapon = null;
        bus.emit('unit:died', {
          unitId: targetUnit.id,
          faction: targetUnit.faction,
        });
      }
      return;
    }

    const targetBld = buildings.get(targetId);
    if (targetBld && targetBld.hp > 0) {
      // Never damage or trigger alarm on same-faction buildings
      if (attackerFaction && attackerFaction === targetBld.faction) {
        return;
      }
      this.markEntityDamaged(targetId);

      const counterMult =
        BALANCE.DAMAGE_COUNTER_MATRIX[damageType].structure ?? 1.0;
      const bldDef = BUILDINGS[targetBld.buildingType];
      const mitigated = Math.max(
        1,
        Math.round(rawDamage * counterMult - bldDef.armor * 0.4),
      );
      targetBld.hp = Math.max(0, targetBld.hp - mitigated);

      if (causesFire) {
        targetBld.fireBurnTimer = BALANCE.BUILDING_FIRE_DURATION_SEC;
      }

      const defenderFaction = factionById.get(targetBld.faction);
      if (defenderFaction && targetBld.hp > 0) {
        AlarmResponseSystem.triggerAlarm(
          targetBld,
          sourceId,
          defenderFaction,
          units.values(),
          buildings.values(),
          grid,
          bus,
        );
      }

      if (targetBld.hp <= 0) {
        this.timeSinceDamaged.delete(targetBld.id);
        grid.setBuildingFootprint(targetBld.tile, targetBld.footprint, null);
      }
    }
  }

  private static getAttackerCombatStats(
    attacker: UnitEntity,
    factionState: FactionState | undefined,
    grid: WorldGrid,
    weatherFireMultiplier: number,
  ): {
    damage: number;
    range: number;
    cooldown: number;
    damageType: DamageType;
  } {
    const tribe = factionState?.tribe ?? 'stonebacks';
    const tribeBonuses = TRIBES[tribe].bonuses;
    const vetMult = VeterancySystem.getDamageMultiplier(attacker);
    const sideDamageMult =
      this.getCombatConfig(attacker.faction).DAMAGE_MULTIPLIER;

    if (attacker.role === 'worker') {
      if (attacker.equippedEmergencyWeapon) {
        const w =
          BALANCE.EMERGENCY_WEAPON_STATS[attacker.equippedEmergencyWeapon];
        return {
          damage: Math.max(1, Math.round(w.damage * vetMult * sideDamageMult)),
          range: TerrainSystem.getEffectiveAttackRange(
            w.range,
            attacker.position,
            grid,
          ),
          cooldown: w.cooldown,
          damageType: w.damageType,
        };
      }
      if (factionState?.alarmActive) {
        return {
          damage: Math.max(
            1,
            Math.round(BALANCE.WORKER_STONE_THROW_DAMAGE * sideDamageMult),
          ),
          range: BALANCE.WORKER_STONE_THROW_RANGE,
          cooldown: BALANCE.WORKER_STONE_THROW_COOLDOWN,
          damageType: 'pierce',
        };
      }
    }

    if (attacker.kind === 'unit') {
      const def = UNITS[attacker.role as UnitRole];
      const wTier =
        factionState?.unitWeaponTiers[attacker.role as UnitRole] ?? 0;
      const tierMult = WEAPON_TIERS[wTier].damageMultiplier;
      const meleeMult =
        def.damageType === 'melee' ? tribeBonuses.meleeDamageMultiplier : 1.0;
      const terrainDmgMult = TerrainSystem.getEffectiveTerrainDamageMultiplier(
        def.attackRange,
        attacker.position,
        grid,
      );
      return {
        damage: Math.max(
          1,
          Math.round(
            def.baseDamage *
              tierMult *
              meleeMult *
              vetMult *
              terrainDmgMult *
              sideDamageMult,
          ),
        ),
        range: TerrainSystem.getEffectiveAttackRange(
          def.attackRange,
          attacker.position,
          grid,
        ),
        cooldown: def.attackCooldown,
        damageType: def.damageType,
      };
    }

    if (attacker.kind === 'machine') {
      const def = MACHINES[attacker.role as keyof typeof MACHINES];
      const fireMult =
        def.damageType === 'fire'
          ? tribeBonuses.fireDamageMultiplier * weatherFireMultiplier
          : 1.0;
      return {
        damage: Math.max(
          1,
          Math.round(
            def.baseDamage *
              tribeBonuses.machineDamageMultiplier *
              fireMult *
              vetMult *
              sideDamageMult,
          ),
        ),
        range: TerrainSystem.getEffectiveAttackRange(
          def.attackRange,
          attacker.position,
          grid,
        ),
        cooldown: def.attackCooldown,
        damageType: def.damageType,
      };
    }

    if (attacker.kind === 'hero') {
      const def = HEROES[tribe];
      return {
        damage: Math.max(
          1,
          Math.round(def.damage * vetMult * sideDamageMult),
        ),
        range: def.attackRange,
        cooldown: 1.1,
        damageType: tribe === 'ember_tribe' ? 'fire' : 'melee',
      };
    }

    const bDef = BEASTS[attacker.role as keyof typeof BEASTS] ?? BEASTS.boar;
    return {
      damage: bDef.damage,
      range: bDef.attackRange,
      cooldown: bDef.attackCooldown,
      damageType: bDef.damageType,
    };
  }

  private static getTargetArmor(
    target: UnitEntity,
    factionState: FactionState | undefined,
  ): { armorType: ArmorType; armorValue: number } {
    if (target.kind === 'unit') {
      const def = UNITS[target.role as UnitRole];
      const aTier =
        factionState?.unitArmorTiers[target.role as UnitRole] ?? 0;
      return {
        armorType: def.armorType,
        armorValue: def.baseArmor + ARMOR_TIERS[aTier].armorBonus,
      };
    }
    if (target.kind === 'machine') {
      const def = MACHINES[target.role as keyof typeof MACHINES];
      return { armorType: def.armorType, armorValue: def.baseArmor };
    }
    if (target.kind === 'hero') {
      const tribe = factionState?.tribe ?? 'stonebacks';
      return { armorType: 'hero', armorValue: HEROES[tribe].armor };
    }
    const bDef = BEASTS[target.role as keyof typeof BEASTS] ?? BEASTS.boar;
    return { armorType: bDef.armorType, armorValue: bDef.armor };
  }

  private static updateShamanHeal(
    shaman: UnitEntity,
    units: ReadonlyMap<EntityId, UnitEntity>,
    _dt: number,
  ): void {
    if (shaman.attackCooldownTimer > 0) {
      return;
    }
    const def = UNITS.shaman;
    const rSq = def.attackRange * def.attackRange;
    for (const ally of units.values()) {
      if (
        ally.hp > 0 &&
        ally.hp < ally.maxHp &&
        ally.faction === shaman.faction &&
        ally.id !== shaman.id
      ) {
        const dx = ally.position.x - shaman.position.x;
        const dz = ally.position.z - shaman.position.z;
        if (dx * dx + dz * dz <= rSq) {
          ally.hp = Math.min(ally.maxHp, ally.hp + def.baseDamage);
          shaman.attackCooldownTimer = def.attackCooldown;
          break;
        }
      }
    }
  }

  private static findNearbyEnemyShieldBearer(
    attacker: UnitEntity,
    units: ReadonlyMap<EntityId, UnitEntity>,
  ): UnitEntity | null {
    const tauntRadiusSq = 4.2 * 4.2;
    for (const u of units.values()) {
      if (
        u.hp > 0 &&
        u.faction !== attacker.faction &&
        u.faction !== 'neutral' &&
        u.role === 'shield_bearer'
      ) {
        const dx = u.position.x - attacker.position.x;
        const dz = u.position.z - attacker.position.z;
        if (dx * dx + dz * dz <= tauntRadiusSq) {
          return u;
        }
      }
    }
    return null;
  }

  private static findNearestEnemyInRange(
    origin: Vec2,
    range: number,
    faction: string,
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
  ): { id: EntityId; position: Vec2 } | null {
    let best: { id: EntityId; position: Vec2 } | null = null;
    let bestDistSq = range * range;

    for (const u of units.values()) {
      if (u.hp <= 0 || u.faction === faction || u.faction === 'neutral') {
        continue;
      }
      const dx = u.position.x - origin.x;
      const dz = u.position.z - origin.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        best = { id: u.id, position: u.position };
      }
    }
    if (best) {
      return best;
    }

    for (const b of buildings.values()) {
      if (b.hp <= 0 || b.faction === faction || b.faction === 'neutral') {
        continue;
      }
      const dx = b.position.x - origin.x;
      const dz = b.position.z - origin.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        best = { id: b.id, position: b.position };
      }
    }
    return best;
  }
}