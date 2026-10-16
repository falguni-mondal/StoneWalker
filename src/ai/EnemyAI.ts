/**
 * STONEWALKER — Difficulty-Scaled Enemy AI Controller (Section 12)
 * - Scales decision speed, worker count, camp expansion speed, and attack wave size
 *   using `BALANCE.AI_DIFFICULTY[this.difficulty]` (Easy, Normal, Hard).
 * - Follows the same Base-Level progression rules as the player:
 *   * Base Lv.1: Builds Lv.1 camps & trains Tier-1 infantry (Clubbers, Spearmen, Slingers).
 *   * Base Lv.2: Builds Sling Range / Beast Pen / Armory & trains Tier-2 troops.
 *   * Base Lv.3: Builds Machine Workshop & trains tribe-signature War Machines.
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import { BASE_TIER_STATS, BUILDINGS } from '../data/buildings';
import type {
  BuildingEntity,
  BuildingType,
  EntityId,
  FactionId,
  FactionState,
  MachineRole,
  TribeId,
  UnitEntity,
  UnitRole,
  Vec2,
} from '../data/types';
import { setBaseMode } from '../entities/Base';
import { createBuildingEntity } from '../entities/Building';
import { ConstructionSystem } from '../systems/Construction';
import { Pathfinder } from '../systems/Pathfinding';
import { ProductionSystem } from '../systems/Production';
import type { WorldGrid } from '../world/Grid';

export type EnemyAIStateName =
  | 'Boom'
  | 'Defend'
  | 'BuildArmy'
  | 'Attack'
  | 'Retreat';

interface TribeMilitaryProfile {
  buildOrder: ReadonlyArray<Exclude<BuildingType, 'base'>>;
  tier1Troops: ReadonlyArray<Exclude<UnitRole, 'worker'>>;
  tier2Troops: ReadonlyArray<Exclude<UnitRole, 'worker'>>;
  machinePool: ReadonlyArray<Exclude<MachineRole, 'crawler'>>;
}

export const TRIBE_MILITARY_PROFILES: Record<TribeId, TribeMilitaryProfile> = {
  stonebacks: {
    buildOrder: [
      'hut',
      'quarry',
      'barracks',
      'armory',
      'lookout',
      'machine_workshop',
    ],
    tier1Troops: ['clubber', 'spearman'],
    tier2Troops: ['clubber', 'shield_bearer', 'spearman'],
    machinePool: ['boulder_thrower', 'shell_walker', 'mammoth_fortress'],
  },
  reef_clan: {
    buildOrder: [
      'hut',
      'forager_camp',
      'barracks',
      'sling_range',
      'beast_pen',
      'machine_workshop',
    ],
    tier1Troops: ['spearman', 'slinger'],
    tier2Troops: ['spearman', 'scout', 'bow_hunter', 'shaman'],
    machinePool: ['raider_cart', 'boulder_thrower'],
  },
  ember_tribe: {
    buildOrder: [
      'hut',
      'woodcutter_camp',
      'barracks',
      'sling_range',
      'armory',
      'machine_workshop',
    ],
    tier1Troops: ['clubber', 'slinger'],
    tier2Troops: ['slinger', 'bow_hunter', 'spearman'],
    machinePool: ['raider_cart', 'bone_ram', 'fire_catapult', 'titan_walker'],
  },
};

export class EnemyAIController {
  public readonly faction: FactionId;
  private readonly difficulty: 'easy' | 'normal' | 'hard';
  private readonly nightAttacks: boolean;
  private readonly baseWalks: boolean;

  private state: EnemyAIStateName = 'Boom';
  private decisionTimer = 0;
  private attackCooldownTimer = 75;
  private expansionTimer = 0;
  private watchdogTimer = 0;
  private lastKnownMetric = 0;
  private buildOrderIndex = 0;
  private trainCycleIndex = 0;

  public constructor(params: {
    faction: FactionId;
    difficulty: 'easy' | 'normal' | 'hard';
    nightAttacks: boolean;
    baseWalks: boolean;
  }) {
    this.faction = params.faction;
    this.difficulty = params.difficulty;
    this.nightAttacks = params.nightAttacks;
    this.baseWalks = params.baseWalks;
    this.attackCooldownTimer =
      BALANCE.AI_DIFFICULTY[params.difficulty].attackIntervalSec * 0.85;
  }

  public getStateName(): EnemyAIStateName {
    return this.state;
  }

  public update(
    factionState: FactionState,
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    playerBasePos: Vec2 | null,
    isNight: boolean,
    grid: WorldGrid,
    bus: EventBus,
    dt: number,
    onSpawnBuilding?: (bld: BuildingEntity) => void,
  ): void {
    const diffParams = BALANCE.AI_DIFFICULTY[this.difficulty];
    const profile = TRIBE_MILITARY_PROFILES[factionState.tribe];

    this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
    this.decisionTimer += dt;
    this.expansionTimer += dt;
    this.watchdogTimer += dt;

    // 60-second Watchdog check
    const currentMetric =
      Math.floor(factionState.resources.food + factionState.resources.wood) +
      factionState.populationUsed * 50 +
      factionState.enemiesDefeated * 100;
    if (currentMetric !== this.lastKnownMetric) {
      this.lastKnownMetric = currentMetric;
      this.watchdogTimer = 0;
    } else if (this.watchdogTimer >= BALANCE.AI_WATCHDOG_TIMEOUT_SECONDS) {
      this.watchdogTimer = 0;
      this.state = 'Boom';
    }

    if (this.decisionTimer < diffParams.decisionIntervalSec) {
      return;
    }
    this.decisionTimer = 0;

    const myBase = this.findMyBase(buildings);
    if (!myBase) {
      return;
    }

    this.syncTechsForBaseLevel(factionState, myBase.level);

    // Camp expansion & Base upgrade interval scaled by Difficulty (Easy: 48s, Normal: 32s, Hard: 22s)
    if (this.expansionTimer >= diffParams.expansionIntervalSec) {
      this.expansionTimer = 0;
      this.tryExpandAndUpgradeBase(
        myBase,
        factionState,
        profile,
        buildings,
        grid,
        onSpawnBuilding,
      );
    }

    const myUnits = Array.from(units.values()).filter(
      (u) => u.hp > 0 && u.faction === this.faction,
    );
    const myWorkers = myUnits.filter((u) => u.role === 'worker');
    const myArmy = myUnits.filter((u) => u.role !== 'worker');

    if (factionState.alarmActive) {
      this.state = 'Defend';
    }

    switch (this.state) {
      case 'Boom': {
        if (
          myWorkers.length < diffParams.maxWorkers &&
          myBase.queue.length < 2
        ) {
          ProductionSystem.enqueueUnitOrItem(
            myBase,
            'worker',
            factionState,
            bus,
          );
        } else {
          this.state = 'BuildArmy';
        }
        break;
      }

      case 'Defend': {
        if (!factionState.alarmActive) {
          this.state = 'BuildArmy';
        }
        break;
      }

      case 'BuildArmy': {
        if (myArmy.length < diffParams.targetArmySize) {
          this.trainUnitForCurrentTier(
            myBase,
            factionState,
            profile,
            buildings,
            bus,
          );
        }

        const nightReady =
          !this.nightAttacks || isNight || this.attackCooldownTimer <= 0;
        const minWaveSize = Math.max(
          4,
          Math.floor(diffParams.targetArmySize * 0.7),
        );
        if (
          myArmy.length >= minWaveSize &&
          this.attackCooldownTimer <= 0 &&
          nightReady
        ) {
          this.state = 'Attack';
          this.attackCooldownTimer = diffParams.attackIntervalSec;
        }
        break;
      }

      case 'Attack': {
        if (!playerBasePos) {
          this.state = 'Boom';
          break;
        }
        if (myArmy.length <= 2) {
          this.state = 'Retreat';
          break;
        }

        for (const soldier of myArmy) {
          if (soldier.path.length === 0 && !soldier.targetEntityId) {
            soldier.status = 'fighting';
            soldier.path = Pathfinder.findPath(
              grid,
              soldier.position,
              playerBasePos,
            );
          }
        }

        if (
          this.baseWalks &&
          myBase.level >= 2 &&
          myBase.hp > myBase.maxHp * 0.65
        ) {
          setBaseMode(myBase, 'move');
          if (myBase.path.length === 0) {
            myBase.path = Pathfinder.findPath(
              grid,
              myBase.position,
              playerBasePos,
              {
                footprint: myBase.footprint,
                ignoreEntityId: myBase.id,
                allowStompable: true,
              },
            );
          }
        }
        break;
      }

      case 'Retreat': {
        setBaseMode(myBase, 'stand');
        for (const soldier of myArmy) {
          soldier.targetEntityId = null;
          soldier.status = 'guarding';
          soldier.path = Pathfinder.findPath(
            grid,
            soldier.position,
            myBase.position,
          );
        }
        this.state = 'Boom';
        break;
      }
    }
  }

  private syncTechsForBaseLevel(
    factionState: FactionState,
    baseLevel: number,
  ): void {
    const addTech = (id: string): void => {
      if (!factionState.researchedTechs.includes(id)) {
        factionState.researchedTechs.push(id);
      }
    };
    if (baseLevel >= 2) {
      addTech('stone_weaponry');
      addTech('bone_shields');
      addTech('sinew_bows');
      addTech('spirit_chants');
    }
    if (baseLevel >= 3) {
      addTech('wheelwright_craft');
      addTech('torsion_frames');
      addTech('carapace_plating');
      addTech('pitch_alchemy');
      if (this.difficulty === 'hard') {
        addTech('colossus_engineering');
        addTech('bronze_titans');
      }
    }
  }

  private tryExpandAndUpgradeBase(
    myBase: BuildingEntity,
    factionState: FactionState,
    profile: TribeMilitaryProfile,
    _buildings: ReadonlyMap<EntityId, BuildingEntity>,
    grid: WorldGrid,
    onSpawnBuilding?: (bld: BuildingEntity) => void,
  ): void {
    // 1. Upgrade AI Base (Lv.1 -> Lv.2 -> Lv.3) once it has built its current tier's buildings
    //    and legitimately saved up the required Wood/Stone/Hide upgrade cost.
    const maxAllowedBaseLv = this.difficulty === 'easy' ? 2 : 3;
    if (
      myBase.level < maxAllowedBaseLv &&
      this.buildOrderIndex >= myBase.level * 2
    ) {
      const nextTier = BASE_TIER_STATS[myBase.level];
      if (
        nextTier &&
        ConstructionSystem.canAfford(
          factionState.resources,
          nextTier.upgradeCost,
        )
      ) {
        ConstructionSystem.spendResources(
          factionState.resources,
          nextTier.upgradeCost,
        );
        myBase.level += 1;
        myBase.maxHp = nextTier.maxHp;
        myBase.hp = nextTier.maxHp;
        return;
      }
    }

    // 2. Construct the next camp building in the tribe's build order if unlocked by Base Level
    if (!onSpawnBuilding || this.buildOrderIndex >= profile.buildOrder.length) {
      return;
    }

    const nextBldType = profile.buildOrder[this.buildOrderIndex]!;
    const def = BUILDINGS[nextBldType];

    if ((def.requiredBaseLevel ?? 1) > myBase.level) {
      return;
    }

    if (!ConstructionSystem.canAfford(factionState.resources, def.cost)) {
      return;
    }

    const angle = this.buildOrderIndex * 1.15;
    const dist = 6 + (this.buildOrderIndex % 3) * 2;
    const desiredTx = Math.round(myBase.position.x + Math.cos(angle) * dist);
    const desiredTz = Math.round(myBase.position.z + Math.sin(angle) * dist);
    const validTile = grid.findNearestValidBuildTile(
      desiredTx,
      desiredTz,
      def.footprint,
      10,
    );

    if (grid.canPlaceBuilding(validTile.tx, validTile.tz, def.footprint)) {
      ConstructionSystem.spendResources(factionState.resources, def.cost);
      const newBld = createBuildingEntity({
        buildingType: nextBldType,
        faction: this.faction,
        tribe: factionState.tribe,
        tile: validTile,
        isConstructed: true,
        level: 1,
      });
      onSpawnBuilding(newBld);
      this.buildOrderIndex += 1;
    }
  }

  private trainUnitForCurrentTier(
    myBase: BuildingEntity,
    factionState: FactionState,
    profile: TribeMilitaryProfile,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    bus: EventBus,
  ): void {
    const workshop = this.findBuildingOfType(buildings, 'machine_workshop');
    const slingRange = this.findBuildingOfType(buildings, 'sling_range');
    const beastPen = this.findBuildingOfType(buildings, 'beast_pen');
    const barracks = this.findBuildingOfType(buildings, 'barracks');

    this.trainCycleIndex += 1;

    // Only train War Machines once the AI has upgraded its Base to Lv.3 AND built a Machine Workshop
    const machineFrequency = this.difficulty === 'hard' ? 4 : 5;
    if (
      myBase.level >= 3 &&
      workshop !== null &&
      this.trainCycleIndex % machineFrequency === 0 &&
      workshop.queue.length < 2
    ) {
      const mRole =
        profile.machinePool[
          this.trainCycleIndex % profile.machinePool.length
        ]!;
      ProductionSystem.enqueueUnitOrItem(
        workshop,
        mRole,
        factionState,
        bus,
      );
      return;
    }

    // Train Tier-2 troops at Base Lv.2+, or Tier-1 troops at Base Lv.1
    const pool =
      myBase.level >= 2 ? profile.tier2Troops : profile.tier1Troops;
    const tRole = pool[this.trainCycleIndex % pool.length]!;

    const producer =
      tRole === 'slinger' || tRole === 'bow_hunter' || tRole === 'shaman'
        ? (slingRange ?? barracks)
        : tRole === 'scout'
          ? (beastPen ?? barracks)
          : barracks;

    if (producer && producer.queue.length < 2) {
      ProductionSystem.enqueueUnitOrItem(
        producer,
        tRole,
        factionState,
        bus,
      );
    }
  }

  private findMyBase(
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
  ): BuildingEntity | null {
    for (const b of buildings.values()) {
      if (b.hp > 0 && b.faction === this.faction && b.buildingType === 'base') {
        return b;
      }
    }
    return null;
  }

  private findBuildingOfType(
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    bType: BuildingType,
  ): BuildingEntity | null {
    for (const b of buildings.values()) {
      if (
        b.hp > 0 &&
        b.isConstructed &&
        b.faction === this.faction &&
        b.buildingType === bType
      ) {
        return b;
      }
    }
    return null;
  }
}