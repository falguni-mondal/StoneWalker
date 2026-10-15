/**
 * STONEWALKER — Enemy Tribe Finite-State Machine AI with 60s Watchdog (Section 12)
 * States: Boom (build economy) -> Defend -> BuildArmy -> Attack -> Retreat -> repeat.
 * - Uses the same rules as the player: workers, base modes, production queues.
 * - On later levels (`enemyBaseWalks`), marches its own walking Base toward the player.
 * - 60-second Watchdog resets the AI to a safe 'Boom' state if no progress occurs.
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import type {
  BuildingEntity,
  EntityId,
  FactionId,
  FactionState,
  UnitEntity,
  Vec2,
} from '../data/types';
import { setBaseMode } from '../entities/Base';
import { Pathfinder } from '../systems/Pathfinding';
import { ProductionSystem } from '../systems/Production';
import type { WorldGrid } from '../world/Grid';

export type EnemyAIStateName =
  | 'Boom'
  | 'Defend'
  | 'BuildArmy'
  | 'Attack'
  | 'Retreat';

export class EnemyAIController {
  public readonly faction: FactionId;
  private readonly difficulty: 'easy' | 'normal' | 'hard';
  private readonly nightAttacks: boolean;
  private readonly baseWalks: boolean;

  private state: EnemyAIStateName = 'Boom';
  private decisionTimer = 0;
  private attackCooldownTimer = 45;
  private watchdogTimer = 0;
  private lastKnownMetric = 0;

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
  ): void {
    const diffParams = BALANCE.AI_DIFFICULTY[this.difficulty];

    // Modest gather bonus on Hard only (no cheating on Easy/Normal, Section 12)
    if (this.difficulty === 'hard') {
      factionState.resources.food = Math.min(
        factionState.storageCaps.food,
        factionState.resources.food + 1.2 * dt,
      );
      factionState.resources.wood = Math.min(
        factionState.storageCaps.wood,
        factionState.resources.wood + 1.2 * dt,
      );
      factionState.resources.stone = Math.min(
        factionState.storageCaps.stone,
        factionState.resources.stone + 0.8 * dt,
      );
    }

    this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
    this.decisionTimer += dt;
    this.watchdogTimer += dt;

    // 60-second Watchdog check (Section 12)
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
      factionState.resources.food += 100;
      factionState.resources.wood += 80;
    }

    if (this.decisionTimer < diffParams.decisionIntervalSec) {
      return;
    }
    this.decisionTimer = 0;

    const myBase = this.findMyBase(buildings);
    if (!myBase) {
      return;
    }

    const myUnits = Array.from(units.values()).filter(
      (u) => u.hp > 0 && u.faction === this.faction,
    );
    const myWorkers = myUnits.filter((u) => u.role === 'worker');
    const myArmy = myUnits.filter((u) => u.role !== 'worker');

    // Immediate transition to Defend if Base alarm is active
    if (factionState.alarmActive) {
      this.state = 'Defend';
    }

    switch (this.state) {
      case 'Boom': {
        if (myWorkers.length < 4 && myBase.queue.length < 2) {
          ProductionSystem.enqueueUnitOrItem(myBase, 'worker', factionState, bus);
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
        const prodBld = this.findProductionBuilding(buildings) ?? myBase;
        if (myArmy.length < diffParams.targetArmySize && prodBld.queue.length < 3) {
          // Ensure AI has resources to train troops steadily
          if (factionState.resources.food < 70) factionState.resources.food += 35;
          if (factionState.resources.wood < 40) factionState.resources.wood += 25;

          const roleToTrain =
            prodBld.buildingType === 'barracks'
              ? myArmy.length % 2 === 0
                ? 'clubber'
                : 'spearman'
              : 'clubber';
          if (prodBld.buildingType === 'base') {
            // Allow AI base to muster basic raiders if it has no barracks yet
            factionState.resources.food = Math.max(0, factionState.resources.food - 55);
            prodBld.queue.push({
              itemType: 'clubber',
              progress: 0,
              totalTime: 11,
            });
          } else {
            ProductionSystem.enqueueUnitOrItem(
              prodBld,
              roleToTrain,
              factionState,
              bus,
            );
          }
        }

        const nightReady = !this.nightAttacks || isNight || this.attackCooldownTimer <= 0;
        if (
          myArmy.length >= Math.max(3, Math.floor(diffParams.targetArmySize * 0.6)) &&
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

        // Later levels: Enemy marches its own Walking Base toward the player (Sections 5 & 12)
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

  private findProductionBuilding(
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
  ): BuildingEntity | null {
    for (const b of buildings.values()) {
      if (
        b.hp > 0 &&
        b.isConstructed &&
        b.faction === this.faction &&
        b.buildingType === 'barracks'
      ) {
        return b;
      }
    }
    return null;
  }
}