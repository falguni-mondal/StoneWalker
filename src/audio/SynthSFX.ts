/**
 * STONEWALKER — WebAudio Synthesized Sound Effects (Section 2)
 * Zero external audio files. Unlocks on the first touch/click gesture and respects
 * master/SFX volume and mute toggles.
 */

import type { SettingsManager } from '../core/Settings';

export class SynthSFX {
  private readonly settings: SettingsManager;
  private ctx: AudioContext | null = null;

  public constructor(settings: SettingsManager) {
    this.settings = settings;
    this.bindUnlockGesture();
  }

  private bindUnlockGesture(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const unlock = (): void => {
      this.ensureContext();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getEffectiveGain(): number {
    const s = this.settings.get();
    if (s.muted) {
      return 0;
    }
    return s.masterVolume * s.sfxVolume;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType = 'triangle',
    volumeScale: number = 0.2,
  ): void {
    const gainLevel = this.getEffectiveGain() * volumeScale;
    if (gainLevel <= 0.001) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freqEnd),
      now + durationSec,
    );

    gain.gain.setValueAtTime(gainLevel, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec);
  }

  public playTap(): void {
    this.playTone(420, 280, 0.06, 'sine', 0.14);
  }

  public playBuildComplete(): void {
    this.playTone(260, 520, 0.22, 'triangle', 0.22);
  }

  public playStomp(): void {
    this.playTone(95, 38, 0.18, 'sawtooth', 0.25);
  }

  public playPowerCast(): void {
    this.playTone(310, 680, 0.38, 'sine', 0.24);
  }

  public playAlarmHorn(): void {
    this.playTone(190, 285, 0.45, 'sawtooth', 0.28);
  }
}