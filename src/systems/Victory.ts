/**
 * STONEWALKER — Campaign & Skirmish Objective & Victory/Defeat System (Section 11)
 * Tracks primary and bonus objectives (destroy enemy bases, move Base to beacon,
 * gather resources, survive time) and detects defeat when the player has no Base left.
 */

import type { EventBus } from '../core/EventBus';
import type {
  BuildingEntity,
  FactionState,
  LevelDefinition,
  LevelObjective,
} from '../data/types';
import { StarSystem } from './Stars';

export interface ObjectiveProgress {
  objective: LevelObjective;
  currentValue: number;
  completed: boolean;
}

export class VictorySystem {
  public static evaluateObjectives(
    level: LevelDefinition,
    playerState: FactionState,
    buildings: Iterable<BuildingEntity>,
    elapsedTimeSec: number,
  ): {
    allPrimaryDone: boolean;
    allBonusDone: boolean;
    playerDefeated: boolean;
    progressList: ObjectiveProgress[];
  } {
    const bldList = Array.from(buildings);

    const playerBases = bldList.filter(
      (b) => b.hp > 0 && b.faction === 'player' && b.buildingType === 'base',
    );
    if (playerBases.length === 0) {
      return {
        allPrimaryDone: false,
        allBonusDone: false,
        playerDefeated: true,
        progressList: [],
      };
    }

    const aliveEnemyBases = bldList.filter(
      (b) =>
        b.hp > 0 &&
        b.faction !== 'player' &&
        b.faction !== 'neutral' &&
        b.buildingType === 'base',
    );
    const enemyBasesDestroyed = Math.max(
      0,
      level.enemyCount - aliveEnemyBases.length,
    );

    const progressList: ObjectiveProgress[] = [];
    let allPrimaryDone = true;
    let allBonusDone = true;

    for (const obj of level.objectives) {
      let currentValue = 0;
      let completed = false;

      switch (obj.type) {
        case 'destroy_enemy_base':
        case 'defeat_boss':
          currentValue = enemyBasesDestroyed;
          completed = aliveEnemyBases.length === 0;
          break;
        case 'move_base_to_beacon': {
          const target = obj.targetPosition;
          if (target) {
            for (const pb of playerBases) {
              const dist = Math.hypot(
                pb.position.x - target.x,
                pb.position.z - target.z,
              );
              if (dist <= 9.5) {
                currentValue = 1;
                completed = true;
                break;
              }
            }
          }
          break;
        }
        case 'gather_resources': {
          const highestRes = Math.max(
            playerState.resources.food,
            playerState.resources.wood,
            playerState.resources.stone,
            playerState.resources.bronze,
          );
          currentValue = Math.floor(highestRes);
          completed = currentValue >= obj.targetValue;
          break;
        }
        case 'survive_time': {
          currentValue = Math.floor(elapsedTimeSec);
          const hpOk = playerBases.some((b) => b.hp >= b.maxHp * 0.5);
          completed = hpOk && currentValue >= obj.targetValue;
          break;
        }
      }

      progressList.push({ objective: obj, currentValue, completed });
      if (obj.isBonus) {
        if (!completed) allBonusDone = false;
      } else {
        if (!completed) allPrimaryDone = false;
      }
    }

    return {
      allPrimaryDone,
      allBonusDone,
      playerDefeated: false,
      progressList,
    };
  }

  public static checkAndEmitEndState(
    level: LevelDefinition,
    playerState: FactionState,
    buildings: Iterable<BuildingEntity>,
    elapsedTimeSec: number,
    bus: EventBus,
  ): { ended: boolean; won: boolean; stars: 0 | 1 | 2 | 3 } {
    const status = this.evaluateObjectives(
      level,
      playerState,
      buildings,
      elapsedTimeSec,
    );

    if (status.playerDefeated) {
      bus.emit('level:ended', { won: false, stars: 0, levelId: level.id });
      return { ended: true, won: false, stars: 0 };
    }

    if (status.allPrimaryDone) {
      const starEval = StarSystem.evaluate(
        level,
        elapsedTimeSec,
        playerState,
        status.allBonusDone,
      );
      bus.emit('level:ended', {
        won: true,
        stars: starEval.stars,
        levelId: level.id,
      });
      return { ended: true, won: true, stars: starEval.stars };
    }

    return { ended: false, won: false, stars: 0 };
  }
}