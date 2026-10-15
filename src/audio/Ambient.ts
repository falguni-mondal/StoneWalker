/**
 * STONEWALKER — WebAudio Ambient & Dynamic Battle Layer Synthesizer (Section 2)
 * Plays a warm prehistoric wind/drone ambient loop and smoothly fades in a tense
 * tribal war-drum pulse during active combat or alarms.
 */

import type { SettingsManager } from '../core/Settings';
import type { SynthSFX } from './SynthSFX';

export class AmbientAudio {
  private readonly settings: SettingsManager;
  private readonly sfx: SynthSFX;
  private pulseTimer = 0;
  private combatIntensity = 0;

  public constructor(settings: SettingsManager, sfx: SynthSFX) {
    this.settings = settings;
    this.sfx = sfx;
  }

  public setCombatActive(active: boolean, dt: number): void {
    const target = active ? 1.0 : 0.0;
    this.combatIntensity += (target - this.combatIntensity) * Math.min(1, dt * 2);
  }

  public update(dt: number): void {
    const s = this.settings.get();
    if (s.muted || s.masterVolume * s.musicVolume <= 0.01) {
      return;
    }

    this.pulseTimer += dt;
    const interval = this.combatIntensity > 0.35 ? 0.65 : 2.4;
    if (this.pulseTimer < interval) {
      return;
    }
    this.pulseTimer = 0;

    const ctx = this.sfx.ensureContext();
    if (!ctx || ctx.state !== 'running') {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const isBattleBeat = this.combatIntensity > 0.35;
    osc.type = isBattleBeat ? 'triangle' : 'sine';
    const baseFreq = isBattleBeat ? 78 : 110;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(
      isBattleBeat ? 44 : 96,
      now + (isBattleBeat ? 0.25 : 1.2),
    );

    const vol =
      s.masterVolume *
      s.musicVolume *
      (isBattleBeat ? 0.16 * this.combatIntensity : 0.06);
    gain.gain.setValueAtTime(Math.max(0.002, vol), now);
    gain.gain.exponentialRampToValueAtTime(
      0.0008,
      now + (isBattleBeat ? 0.28 : 1.25),
    );

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (isBattleBeat ? 0.3 : 1.3));
  }
}