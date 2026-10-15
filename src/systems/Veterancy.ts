/**
 * STONEWALKER — Unit Veterancy System (Section 8B)
 * Units earn up to 3 ranks from kills, granting stat boosts and a chevron badge.
 */

import { BALANCE } from '../data/balance';
import type { UnitEntity } from '../data/types';

export class VeterancySystem {
  public static recordKill(attacker: UnitEntity): boolean {
    if (attacker.hp <= 0) {
      return false;
    }
    attacker.veterancyKills += 1;
    const thresholds = BALANCE.VETERANCY_KILL_THRESHOLDS;
    let newRank: 0 | 1 | 2 | 3 = 0;
    if (attacker.veterancyKills >= thresholds[2]) {
      newRank = 3;
    } else if (attacker.veterancyKills >= thresholds[1]) {
      newRank = 2;
    } else if (attacker.veterancyKills >= thresholds[0]) {
      newRank = 1;
    }

    if (newRank > attacker.veterancyRank) {
      const prevMult =
        BALANCE.VETERANCY_STAT_MULTIPLIERS[attacker.veterancyRank];
      const nextMult = BALANCE.VETERANCY_STAT_MULTIPLIERS[newRank];
      const ratio = nextMult / prevMult;
      attacker.veterancyRank = newRank;
      attacker.maxHp = Math.round(attacker.maxHp * ratio);
      attacker.hp = Math.min(attacker.maxHp, Math.round(attacker.hp * ratio + 15));
      return true;
    }
    return false;
  }

  public static getDamageMultiplier(unit: UnitEntity): number {
    return BALANCE.VETERANCY_STAT_MULTIPLIERS[unit.veterancyRank];
  }
}