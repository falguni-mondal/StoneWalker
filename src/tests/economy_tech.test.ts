/**
 * STONEWALKER — Vitest Unit Tests: Economy Storage Caps, Tech Prerequisites & Star Ratings (Section 17)
 */

import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import { CAMPAIGN_LEVELS } from '../data/levels';
import type { FactionState } from '../data/types';
import { createBaseEntity } from '../entities/Base';
import { createBuildingEntity } from '../entities/Building';
import { HousingSystem } from '../systems/Housing';
import { StarSystem } from '../systems/Stars';
import { TechSystem } from '../systems/Tech';

describe('Economy, Storage Caps, Tech Prerequisites & Star Ratings', () => {
  it('raises storage caps with Storage Pits and clamps excess resources', () => {
    const fState: FactionState = {
      faction: 'player',
      tribe: 'stonebacks',
      resources: { food: 9999, wood: 200, stone: 100, hide: 50, bronze: 0 },
      storageCaps: { ...BALANCE.BASE_STORAGE_CAP },
      populationUsed: 0,
      populationCap: 12,
      workerPriorities: { food: 3, wood: 3, stone: 3, hide: 1, bronze: 1 },
      researchedTechs: [],
      activeResearch: null,
      unitWeaponTiers: {
        worker: 0,
        clubber: 0,
        spearman: 0,
        shield_bearer: 0,
        slinger: 0,
        bow_hunter: 0,
        scout: 0,
        shaman: 0,
      },
      unitArmorTiers: {
        worker: 0,
        clubber: 0,
        spearman: 0,
        shield_bearer: 0,
        slinger: 0,
        bow_hunter: 0,
        scout: 0,
        shaman: 0,
      },
      unlockedWeaponTier: 0,
      unlockedArmorTier: 0,
      powerCooldowns: {
        healing_rain: 0,
        rally_roar: 0,
        fire_rain: 0,
        earthquake: 0,
      },
      alarmActive: false,
      alarmPosition: null,
      alarmTimer: 0,
      unitsLost: 0,
      enemiesDefeated: 0,
    };

    const base = createBaseEntity({
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 10, tz: 10 },
    });
    const pit = createBuildingEntity({
      buildingType: 'storage_pit',
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 15, tz: 10 },
      isConstructed: true,
    });

    HousingSystem.recomputeCaps(fState, [base, pit], []);

    expect(fState.storageCaps.food).toBe(
      BALANCE.BASE_STORAGE_CAP.food + BALANCE.STORAGE_PIT_BONUS.food,
    );
    expect(fState.resources.food).toBe(fState.storageCaps.food);
  });

  it('enforces technology prerequisites before starting research', () => {
    const bus = new EventBus();
    const hall = createBuildingEntity({
      buildingType: 'research_hall',
      faction: 'player',
      tribe: 'stonebacks',
      tile: { tx: 10, tz: 10 },
      isConstructed: true,
    });
    const fState: FactionState = {
      faction: 'player',
      tribe: 'stonebacks',
      resources: { food: 500, wood: 500, stone: 500, hide: 500, bronze: 500 },
      storageCaps: { ...BALANCE.BASE_STORAGE_CAP },
      populationUsed: 0,
      populationCap: 12,
      workerPriorities: { food: 3, wood: 3, stone: 3, hide: 1, bronze: 1 },
      researchedTechs: [],
      activeResearch: null,
      unitWeaponTiers: {
        worker: 0,
        clubber: 0,
        spearman: 0,
        shield_bearer: 0,
        slinger: 0,
        bow_hunter: 0,
        scout: 0,
        shaman: 0,
      },
      unitArmorTiers: {
        worker: 0,
        clubber: 0,
        spearman: 0,
        shield_bearer: 0,
        slinger: 0,
        bow_hunter: 0,
        scout: 0,
        shaman: 0,
      },
      unlockedWeaponTier: 0,
      unlockedArmorTier: 0,
      powerCooldowns: {
        healing_rain: 0,
        rally_roar: 0,
        fire_rain: 0,
        earthquake: 0,
      },
      alarmActive: false,
      alarmPosition: null,
      alarmTimer: 0,
      unitsLost: 0,
      enemiesDefeated: 0,
    };

    // woven_baskets requires flint_tools first
    const checkBlocked = TechSystem.canResearch('woven_baskets', fState, [hall]);
    expect(checkBlocked.ok).toBe(false);

    // Research flint_tools and complete it
    expect(TechSystem.startResearch('flint_tools', fState, [hall], bus)).toBe(true);
    TechSystem.update(fState, [hall], 1.0, bus, 20);
    expect(fState.researchedTechs).toContain('flint_tools');

    // Now woven_baskets is unlocked
    const checkUnlocked = TechSystem.canResearch('woven_baskets', fState, [hall]);
    expect(checkUnlocked.ok).toBe(true);
  });

  it('calculates 1, 2, and 3 star ratings accurately', () => {
    const level1 = CAMPAIGN_LEVELS[0]!;
    const fState: FactionState = {
      faction: 'player',
      tribe: 'stonebacks',
      resources: { ...BALANCE.STARTING_RESOURCES },
      storageCaps: { ...BALANCE.BASE_STORAGE_CAP },
      populationUsed: 0,
      populationCap: 12,
      workerPriorities: { food: 3, wood: 3, stone: 3, hide: 1, bronze: 1 },
      researchedTechs: [],
      activeResearch: null,
      unitWeaponTiers: {
        worker: 0,
        clubber: 0,
        spearman: 0,
        shield_bearer: 0,
        slinger: 0,
        bow_hunter: 0,
        scout: 0,
        shaman: 0,
      },
      unitArmorTiers: {
        worker: 0,
        clubber: 0,
        spearman: 0,
        shield_bearer: 0,
        slinger: 0,
        bow_hunter: 0,
        scout: 0,
        shaman: 0,
      },
      unlockedWeaponTier: 0,
      unlockedArmorTier: 0,
      powerCooldowns: {
        healing_rain: 0,
        rally_roar: 0,
        fire_rain: 0,
        earthquake: 0,
      },
      alarmActive: false,
      alarmPosition: null,
      alarmTimer: 0,
      unitsLost: 25,
      enemiesDefeated: 10,
    };

    // Slow win with heavy losses -> 1 Star
    const oneStar = StarSystem.evaluate(level1, 900, fState, false);
    expect(oneStar.stars).toBe(1);

    // Fast win without bonus -> 2 Stars
    const twoStar = StarSystem.evaluate(level1, 200, fState, false);
    expect(twoStar.stars).toBe(2);

    // Fast win + bonus objective -> 3 Stars
    const threeStar = StarSystem.evaluate(level1, 200, fState, true);
    expect(threeStar.stars).toBe(3);
  });
});