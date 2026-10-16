/**
 * STONEWALKER — Fair, Paced Enemy AI Controller (Section 12)
 * - Strictly obeys Base-Level progression:
 *   * Base Lv.1: Basic Stone Age troops only (Clubbers, Spearmen, Slingers).
 *   * Base Lv.2: Unlocks Tier-2 troops (Shield Bearers, Bow Hunters, Scouts).
 *   * Base Lv.3 + Constructed Machine Workshop: Unlocks War Machines (and only after the
 *     player has also reached Base Lv.3).
 * - Zero resource cheating: AI must legitimately afford every unit and building.
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
    machinePool: ['boulder_thrower', 'shell_walker'],
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
    tier2Troops: ['spearman', 'scout', 'bow_hunter'],
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
    machinePool: ['raider_cart', 'bone_ram', 'fire_catapult'],
  },
};

export class EnemyAIController {
  public readonly faction: FactionId;
  private readonly difficulty: 'easy' | 'normal' | 'hard';
  private readonly nightAttacks: boolean;
  private readonly baseWalks: boolean;

  private state: EnemyAIStateName = 'Boom';
  private decisionTimer = 0;
  private attackCooldownTimer = 95;
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
      BALANCE.AI_DIFFICULTY[params.difficulty].attackIntervalSec;
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

    // 60-second Watchdog check (resets state if stuck, without granting free resources)
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

    const playerBaseLevel = ConstructionSystem.getFactionBaseLevel(
      'player',
      buildings.values(),
    );

    // Sync AI tech unlocks strictly to the AI's current Base Level
    this.syncTechsForBaseLevel(factionState, myBase.level);

    // Slow, fair camp expansion (checks every 65 seconds instead of 16 seconds)
    if (this.expansionTimer >= 65) {
      this.expansionTimer = 0;
      this.tryExpandAndUpgradeBase(
        myBase,
        playerBaseLevel,
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

    const maxWorkers =
      this.difficulty === 'easy' ? 2 : this.difficulty === 'normal' ? 3 : 3;

    if (factionState.alarmActive) {
      this.state = 'Defend';
    }

    switch (this.state) {
      case 'Boom': {
        if (myWorkers.length < maxWorkers && myBase.queue.length < 1) {
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
          this.trainFairUnit(
            myBase,
            playerBaseLevel,
            factionState,
            profile,
            buildings,
            bus,
          );
        }

        const nightReady =
          !this.nightAttacks || isNight || this.attackCooldownTimer <= 0;
        const minWaveSize = Math.max(
          3,
          Math.floor(diffParams.targetArmySize * 0.75),
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
          myBase.level >= 3 &&
          myBase.hp > myBase.maxHp * 0.7
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
    }
    if (baseLevel >= 3) {
      addTech('wheelwright_craft');
      addTech('torsion_frames');
      addTech('carapace_plating');
      addTech('pitch_alchemy');
    }
  }

  private tryExpandAndUpgradeBase(
    myBase: BuildingEntity,
    playerBaseLevel: number,
    factionState: FactionState,
    profile: TribeMilitaryProfile,
    _buildings: ReadonlyMap<EntityId, BuildingEntity>,
    grid: WorldGrid,
    onSpawnBuilding?: (bld: BuildingEntity) => void,
  ): void {
    // AI never upgrades its Base ahead of the player's Base Level!
    if (
      myBase.level < 3 &&
      myBase.level < playerBaseLevel &&
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

    if (!onSpawnBuilding || this.buildOrderIndex >= profile.buildOrder.length) {
      return;
    }

    const nextBldType = profile.buildOrder[this.buildOrderIndex]!;
    const def = BUILDINGS[nextBldType];

    // Respect Base-Level building requirements (e.g. Machine Workshop requires Base Lv.3)
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

  private trainFairUnit(
    myBase: BuildingEntity,
    playerBaseLevel: number,
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

    // Strictly gate War Machines: requires AI Base Lv.3, Player Base Lv.3, AND a built Machine Workshop
    if (
      myBase.level >= 3 &&
      playerBaseLevel >= 3 &&
      workshop !== null &&
      this.trainCycleIndex % 6 === 0 &&
      workshop.queue.length < 1
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

    // Choose troop pool based on AI Base Level
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