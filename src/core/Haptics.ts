/**
 * STONEWALKER — Haptics Wrapper
 * Triggers subtle navigator.vibrate patterns for key tactile moments on mobile devices
 * (alarm, building complete, power cast, UI tap) when enabled in Settings.
 */

import type { SettingsManager } from './Settings';

export class Haptics {
  private readonly settings: SettingsManager;

  public constructor(settings: SettingsManager) {
    this.settings = settings;
  }

  private canVibrate(): boolean {
    if (!this.settings.get().hapticsEnabled) {
      return false;
    }
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    );
  }

  public custom(pattern: number | number[]): void {
    if (!this.canVibrate()) {
      return;
    }
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore browsers that block vibration without active user gesture
    }
  }

  /** Light 12ms tick for button presses and selection. */
  public tap(): void {
    this.custom(12);
  }

  /** Double crisp pulse when a building finishes construction or upgrades. */
  public buildComplete(): void {
    this.custom([25, 45, 35]);
  }

  /** Resonant pulse when casting a Spirit Power or Hero ability. */
  public powerCast(): void {
    this.custom([40, 30, 65]);
  }

  /** Heavy rhythmic rumble when the Base stomps obstacles. */
  public stomp(): void {
    this.custom(35);
  }

  /** Urgent triple buzz when the Base or Camp Alarm triggers (Section 9B). */
  public alarm(): void {
    this.custom([70, 50, 70, 50, 110]);
  }
}