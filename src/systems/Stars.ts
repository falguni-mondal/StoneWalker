/**
 * STONEWALKER — 3-Star Campaign & Skirmish Rating Evaluator (Section 11)
 * 1 Star  = Win the level (complete all primary objectives).
 * 2 Stars = Win within `twoStarTimeLimitSec` OR with `unitsLost <= twoStarMaxLosses`.
 * 3 Stars = Earn 2 Stars AND complete the level's bonus objective (or achieve both time & low losses).
 */

import type { FactionState, LevelDefinition } from '../data/types';

export interface StarEvaluationResult {
  stars: 1 | 2 | 3;
  underTimeLimit: boolean;
  underLossLimit: boolean;
  bonusCompleted: boolean;
  reasons: string[];
}

export class StarSystem {
  public static evaluate(
    level: LevelDefinition,
    elapsedTimeSec: number,
    playerState: FactionState,
    bonusObjectiveCompleted: boolean,
  ): StarEvaluationResult {
    const underTimeLimit = elapsedTimeSec <= level.twoStarTimeLimitSec;
    const underLossLimit = playerState.unitsLost <= level.twoStarMaxLosses;

    const reasons: string[] = ['★ Victory achieved!'];
    let stars: 1 | 2 | 3 = 1;

    if (underTimeLimit || underLossLimit) {
      stars = 2;
      if (underTimeLimit) {
        reasons.push(
          `★ Completed under ${Math.round(level.twoStarTimeLimitSec / 60)}m time goal!`,
        );
      } else {
        reasons.push(
          `★ Lost ${playerState.unitsLost} units (goal: ≤${level.twoStarMaxLosses})!`,
        );
      }
    }

    if (
      stars === 2 &&
      (bonusObjectiveCompleted || (underTimeLimit && underLossLimit))
    ) {
      stars = 3;
      reasons.push(`★ Bonus Mastery: ${level.threeStarBonusText}`);
    }

    return {
      stars,
      underTimeLimit,
      underLossLimit,
      bonusCompleted: bonusObjectiveCompleted,
      reasons,
    };
  }
}