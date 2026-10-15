/**
 * STONEWALKER — Day/Night Cycle Controller (Section 4)
 * Enhanced with bright silvery-blue moonlight at night so the battlefield is
 * always clear and readable while preserving the -40% night vision gameplay rule.
 */

import { BALANCE } from '../data/balance';
import type { EventBus } from './EventBus';

export interface DayNightLighting {
  timeOfDay: number; // 0..1 (0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk)
  isNight: boolean;
  sunDirection: { x: number; y: number; z: number };
  sunColorHex: number;
  sunIntensity: number;
  ambientColorHex: number;
  ambientIntensity: number;
  skyColorHex: number;
  visionMultiplier: number;
  formattedClock: string;
}

export interface DayNightSerializedState {
  timeOfDay: number;
  cycleDurationSec: number;
  isNight: boolean;
}

export class DayNightCycle {
  private readonly bus: EventBus;
  private timeOfDay: number;
  private cycleDurationSec: number;
  private isNight: boolean;

  public constructor(
    bus: EventBus,
    cycleDurationSec: number = BALANCE.DAY_NIGHT_CYCLE_SECONDS,
    initialTimeOfDay: number = 0.34, // Start in bright mid-morning sunlight
  ) {
    this.bus = bus;
    this.cycleDurationSec = Math.max(30, cycleDurationSec);
    this.timeOfDay = ((initialTimeOfDay % 1) + 1) % 1;
    this.isNight = this.computeIsNight(this.timeOfDay);
  }

  private computeIsNight(t: number): boolean {
    return (
      t >= BALANCE.NIGHT_START_NORMALIZED || t < BALANCE.NIGHT_END_NORMALIZED
    );
  }

  public update(dt: number): void {
    this.timeOfDay = (this.timeOfDay + dt / this.cycleDurationSec) % 1;
    const nowNight = this.computeIsNight(this.timeOfDay);
    if (nowNight !== this.isNight) {
      this.isNight = nowNight;
      this.bus.emit('daynight:phaseChanged', {
        isNight: this.isNight,
        timeOfDay: this.timeOfDay,
      });
    }
  }

  public getTimeOfDay(): number {
    return this.timeOfDay;
  }

  public getIsNight(): boolean {
    return this.isNight;
  }

  public getVisionMultiplier(): number {
    const dayFactor = this.getDaylightFactor();
    return (
      BALANCE.NIGHT_VISION_MULTIPLIER +
      (1.0 - BALANCE.NIGHT_VISION_MULTIPLIER) * dayFactor
    );
  }

  /**
   * Returns a smooth [0..1] daylight factor (0 = moonlit night, 1 = bright day).
   */
  public getDaylightFactor(): number {
    const t = this.timeOfDay;
    if (t >= 0.15 && t <= 0.25) {
      return (t - 0.15) / 0.1;
    }
    if (t > 0.25 && t < 0.65) {
      return 1.0;
    }
    if (t >= 0.65 && t <= 0.75) {
      return 1.0 - (t - 0.65) / 0.1;
    }
    return 0.0;
  }

  public getLighting(): DayNightLighting {
    const dayFactor = this.getDaylightFactor();
    const angle = (this.timeOfDay - 0.22) * Math.PI * 2;
    const sunX = Math.cos(angle) * 42;
    const sunY = Math.max(24, Math.sin(angle) * 52 + 28);
    const sunZ = 28;

    // Silvery-blue moonlight (0x90b8f8) -> Warm golden sunlight (0xfff0c8)
    const sunColorHex = this.lerpColorHex(0x90b8f8, 0xfff0c8, dayFactor);
    // Bright indigo-slate night ambient (0x6e85b5) -> Warm parchment day ambient (0xfaf0dc)
    const ambientColorHex = this.lerpColorHex(0x6e85b5, 0xfaf0dc, dayFactor);
    // Deep twilight blue sky (0x24344d) -> Crisp sky blue (0x9ad0dc)
    const skyColorHex = this.lerpColorHex(0x24344d, 0x9ad0dc, dayFactor);

    // High minimum intensity at night so the map is never dark or muddy
    const sunIntensity = 0.95 + dayFactor * 0.95;
    const ambientIntensity = 0.85 + dayFactor * 0.35;

    const totalHours = Math.floor(this.timeOfDay * 24);
    const totalMinutes = Math.floor(((this.timeOfDay * 24) % 1) * 60);
    const formattedClock = `${String(totalHours).padStart(2, '0')}:${String(
      totalMinutes,
    ).padStart(2, '0')}`;

    return {
      timeOfDay: this.timeOfDay,
      isNight: this.isNight,
      sunDirection: { x: sunX, y: sunY, z: sunZ },
      sunColorHex,
      sunIntensity,
      ambientColorHex,
      ambientIntensity,
      skyColorHex,
      visionMultiplier: this.getVisionMultiplier(),
      formattedClock,
    };
  }

  private lerpColorHex(hexA: number, hexB: number, t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    const rA = (hexA >> 16) & 0xff;
    const gA = (hexA >> 8) & 0xff;
    const bA = hexA & 0xff;

    const rB = (hexB >> 16) & 0xff;
    const gB = (hexB >> 8) & 0xff;
    const bB = hexB & 0xff;

    const r = Math.round(rA + (rB - rA) * clamped);
    const g = Math.round(gA + (gB - gA) * clamped);
    const b = Math.round(bA + (bB - bA) * clamped);

    return (r << 16) | (g << 8) | b;
  }

  public getState(): DayNightSerializedState {
    return {
      timeOfDay: this.timeOfDay,
      cycleDurationSec: this.cycleDurationSec,
      isNight: this.isNight,
    };
  }

  public setState(state: DayNightSerializedState): void {
    this.timeOfDay = ((state.timeOfDay % 1) + 1) % 1;
    this.cycleDurationSec = Math.max(30, state.cycleDurationSec);
    this.isNight = this.computeIsNight(this.timeOfDay);
  }
}