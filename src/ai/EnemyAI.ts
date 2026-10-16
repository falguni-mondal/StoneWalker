/**
 * STONEWALKER — Living Enemy AI with Base Expansion & Tribe-Distinct Armies (Section 12)
 * - Actively expands its camp by constructing new buildings and upgrading its Base (Lv.1 -> 2 -> 3).
 * - Each tribe trains its own distinct signature roster of troops and war machines:
 *   * `stonebacks`: Bone Clubbers, Shield Bearers, Boulder Throwers, Shell Walkers, Mammoth Fortresses
 *   * `reef_clan`:  Flint Spearmen, Raptor Scouts, Bow Hunters, Bone Shamans, Raider Carts
 *   * `ember_tribe`: Stone Slingers, Bow Hunters, Bone Rams, Fire Catapults, Titan Walkers
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
  troopPool: ReadonlyArray<Exclude<UnitRole, 'worker'>>;
  machinePool: ReadonlyArray<Exclude<MachineRole, 'crawler'>>;
  unlockTechs: readonly string[];
}

export const TRIBE_MILITARY_PROFILES: Record<TribeId, TribeMilitaryProfile> = {
  stonebacks: {
    buildOrder: [
      'hut',
      'quarry',
      'barracks',
      'armory',
      'machine_workshop',
      'lookout',
    ],
    troopPool: ['clubber', 'shield_bearer', 'clubber', 'shield_bearer'],
    machinePool: ['boulder_thrower', 'shell_walker', 'mammoth_fortress'],
    unlockTechs: [
      'stone_weaponry',
      'bone_shields',
      'wheelwright_craft',
      'torsion_frames',
      'carapace_plating',
      'colossus_engineering',
    ],
  },
  reef_clan: {
    buildOrder: [
      'hut',
      'forager_camp',
      'sling_range',
      'beast_pen',
      'machine_workshop',
      'spirit_totem',
    ],
    troopPool: ['spearman', 'scout', 'bow_hunter', 'shaman'],
    machinePool: ['raider_cart', 'boulder_thrower'],
    unlockTechs: [
      'stone_weaponry',
      'sinew_bows',
      'spirit_chants',
      'wheelwright_craft',
      'torsion_frames',
    ],
  },
  ember_tribe: {
    buildOrder: [
      'hut',
      'woodcutter_camp',
      'sling_range',
      'machine_workshop',
      'bronze_mine',
      'armory',
    ],
    troopPool: ['slinger', 'bow_hunter', 'spearman', 'slinger'],
    machinePool: ['bone_ram', 'fire_catapult', 'titan_walker'],
    unlockTechs: [
      'stone_weaponry',
      'sinew_bows',
      'wheelwright_craft',
      'pitch_alchemy',
      'colossus_engineering',
      'bronze_titans',
    ],
  },
};

export class EnemyAIController {
  public readonly faction: FactionId;
  private readonly difficulty: 'easy' | 'normal' | 'hard';
  private readonly nightAttacks: boolean;
  private readonly baseWalks: boolean;

  private state: EnemyAIStateName = 'Boom';
  private decisionTimer = 0;
  private attackCooldownTimer = 45;
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
      BALANCE.AI_DIFFICULTY[params.difficulty].attackIntervalSec * 0.7;
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

    for (const techId of profile.unlockTechs) {
      if (!factionState.researchedTechs.includes(techId)) {
        factionState.researchedTechs.push(techId);
      }
    }

    if (this.difficulty === 'hard') {
      factionState.resources.food = Math.min(
        factionState.storageCaps.food,
        factionState.resources.food + 1.4 * dt,
      );
      factionState.resources.wood = Math.min(
        factionState.storageCaps.wood,
        factionState.resources.wood + 1.4 * dt,
      );
      factionState.resources.stone = Math.min(
        factionState.storageCaps.stone,
        factionState.resources.stone + 1.0 * dt,
      );
    }

    this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
    this.decisionTimer += dt;
    this.expansionTimer += dt;
    this.watchdogTimer += dt;

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
      factionState.resources.food += 120;
      factionState.resources.wood += 120;
      factionState.resources.stone += 90;
    }

    if (this.decisionTimer < diffParams.decisionIntervalSec) {
      return;
    }
    this.decisionTimer = 0;

    const myBase = this.findMyBase(buildings);
    if (!myBase) {
      return;
    }

    if (this.expansionTimer >= 16) {
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
        if (myWorkers.length < 4 && myBase.queue.length < 2) {
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
          this.trainTribeSignatureUnit(
            myBase,
            factionState,
            profile,
            buildings,
            bus,
          );
        }

        const nightReady =
          !this.nightAttacks || isNight || this.attackCooldownTimer <= 0;
        if (
          myArmy.length >=
            Math.max(3, Math.floor(diffParams.targetArmySize * 0.6)) &&
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
        if (myArmy.length <= 1) {
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

        if (this.baseWalks && myBase.hp > myBase.maxHp * 0.55) {
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

  private tryExpandAndUpgradeBase(
    myBase: BuildingEntity,
    factionState: FactionState,
    profile: TribeMilitaryProfile,
    _buildings: ReadonlyMap<EntityId, BuildingEntity>,
    grid: WorldGrid,
    onSpawnBuilding?: (bld: BuildingEntity) => void,
  ): void {
    if (
      myBase.level < 3 &&
      this.buildOrderIndex >= myBase.level * 2 &&
      factionState.resources.wood >= 200 &&
      factionState.resources.stone >= 160
    ) {
      factionState.resources.wood -= 180;
      factionState.resources.stone -= 140;
      myBase.level += 1;
      const tier = BASE_TIER_STATS[myBase.level - 1]!;
      myBase.maxHp = tier.maxHp;
      myBase.hp = tier.maxHp;
      return;
    }

    if (!onSpawnBuilding || this.buildOrderIndex >= profile.buildOrder.length) {
      return;
    }

    const nextBldType = profile.buildOrder[this.buildOrderIndex]!;
    const def = BUILDINGS[nextBldType];
    if (
      factionState.resources.wood < (def.cost.wood ?? 60) ||
      factionState.resources.stone < (def.cost.stone ?? 30)
    ) {
      factionState.resources.wood += 45;
      factionState.resources.stone += 35;
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
      factionState.resources.wood = Math.max(
        0,
        factionState.resources.wood - (def.cost.wood ?? 0),
      );
      factionState.resources.stone = Math.max(
        0,
        factionState.resources.stone - (def.cost.stone ?? 0),
      );
      const newBld = createBuildingEntity({
        buildingType: nextBldType,
        faction: this.faction,
        tribe: factionState.tribe,
        tile: validTile,
        isConstructed: true,
        level: myBase.level,
      });
      onSpawnBuilding(newBld);
      this.buildOrderIndex += 1;
    }
  }

  private trainTribeSignatureUnit(
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

    if (
      this.trainCycleIndex % 4 === 0 &&
      (workshop || myBase.level >= 2)
    ) {
      const mRole =
        profile.machinePool[
          this.trainCycleIndex % profile.machinePool.length
        ]!;
      const producer = workshop ?? myBase;
      if (producer.queue.length < 3) {
        this.ensureUnitResources(factionState);
        producer.queue.push({
          itemType: mRole,
          progress: 0,
          totalTime: 18,
        });
        return;
      }
    }

    const tRole =
      profile.troopPool[this.trainCycleIndex % profile.troopPool.length]!;
    const producer =
      tRole === 'slinger' || tRole === 'bow_hunter' || tRole === 'shaman'
        ? (slingRange ?? barracks ?? myBase)
        : tRole === 'scout'
          ? (beastPen ?? barracks ?? myBase)
          : (barracks ?? myBase);

    if (producer.queue.length < 3) {
      this.ensureUnitResources(factionState);
      if (producer.buildingType === 'base') {
        producer.queue.push({
          itemType: tRole,
          progress: 0,
          totalTime: 11,
        });
      } else {
        ProductionSystem.enqueueUnitOrItem(
          producer,
          tRole,
          factionState,
          bus,
        );
      }
    }
  }

  private ensureUnitResources(factionState: FactionState): void {
    if (factionState.resources.food < 90) factionState.resources.food += 55;
    if (factionState.resources.wood < 90) factionState.resources.wood += 55;
    if (factionState.resources.stone < 70) factionState.resources.stone += 40;
    if (factionState.resources.hide < 50) factionState.resources.hide += 30;
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