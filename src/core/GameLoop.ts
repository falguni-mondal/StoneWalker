/**
 * STONEWALKER — Fixed-Timestep Simulation & Render GameLoop
 * Separates deterministic simulation ticks from requestAnimationFrame rendering,
 * pauses automatically when the tab is hidden, and monitors FPS for auto-quality.
 */

import { CONFIG } from '../config';
import type { EventBus } from './EventBus';
import type { SettingsManager } from './Settings';

export type SimulationCallback = (dt: number, tickCount: number) => void;
export type RenderCallback = (alpha: number, frameDelta: number) => void;

export class GameLoop {
  private readonly bus: EventBus;
  private readonly settings: SettingsManager;
  private readonly onSimulate: SimulationCallback;
  private readonly onRender: RenderCallback;

  private running = false;
  private paused = false;
  private rafId: number | null = null;
  private lastTimestamp = 0;
  private accumulator = 0;
  private tickCount = 0;
  private elapsedTime = 0;

  // FPS & Auto-Quality Monitoring
  private frameCount = 0;
  private fpsElapsed = 0;
  private currentFps = 60;
  private lowFpsDuration = 0;

  private readonly handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.hidden) {
      this.setPaused(true);
    }
  };

  public constructor(
    bus: EventBus,
    settings: SettingsManager,
    onSimulate: SimulationCallback,
    onRender: RenderCallback,
  ) {
    this.bus = bus;
    this.settings = settings;
    this.onSimulate = onSimulate;
    this.onRender = onRender;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }
    this.paused = paused;
    this.bus.emit('game:pauseChanged', { paused });
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public getFps(): number {
    return this.currentFps;
  }

  public getTickCount(): number {
    return this.tickCount;
  }

  public getElapsedTime(): number {
    return this.elapsedTime;
  }

  /**
   * Advances simulation deterministically by N steps (useful for tests).
   */
  public stepTicks(steps: number): void {
    const dt = CONFIG.FIXED_TIMESTEP_SEC;
    for (let i = 0; i < steps; i++) {
      this.tickCount += 1;
      this.elapsedTime += dt;
      this.onSimulate(dt, this.tickCount);
      this.bus.emit('game:tick', {
        tickCount: this.tickCount,
        dt,
        elapsedTime: this.elapsedTime,
      });
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.running) {
      return;
    }

    const rawDelta = Math.max(0, (now - this.lastTimestamp) / 1000);
    this.lastTimestamp = now;
    const frameDelta = Math.min(rawDelta, CONFIG.MAX_FRAME_DELTA_SEC);

    this.updateFpsMetrics(rawDelta);

    if (!this.paused) {
      this.accumulator += frameDelta;
      const fixedDt = CONFIG.FIXED_TIMESTEP_SEC;
      while (this.accumulator >= fixedDt) {
        this.tickCount += 1;
        this.elapsedTime += fixedDt;
        this.onSimulate(fixedDt, this.tickCount);
        this.bus.emit('game:tick', {
          tickCount: this.tickCount,
          dt: fixedDt,
          elapsedTime: this.elapsedTime,
        });
        this.accumulator -= fixedDt;
      }
    }

    const alpha = this.accumulator / CONFIG.FIXED_TIMESTEP_SEC;
    this.onRender(alpha, frameDelta);

    this.rafId = requestAnimationFrame(this.frame);
  };

  private updateFpsMetrics(rawDelta: number): void {
    if (rawDelta <= 0) {
      return;
    }
    this.frameCount += 1;
    this.fpsElapsed += rawDelta;

    if (this.fpsElapsed >= 0.5) {
      this.currentFps = Math.round(this.frameCount / this.fpsElapsed);
      if (
        !this.paused &&
        this.currentFps < CONFIG.AUTO_QUALITY_FPS_THRESHOLD
      ) {
        this.lowFpsDuration += this.fpsElapsed;
        if (this.lowFpsDuration >= CONFIG.AUTO_QUALITY_WINDOW_SECONDS) {
          this.settings.stepDownAutoQuality(this.currentFps);
          this.lowFpsDuration = 0;
        }
      } else {
        this.lowFpsDuration = 0;
      }
      this.frameCount = 0;
      this.fpsElapsed = 0;
    }
  }

  public dispose(): void {
    this.stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this.handleVisibilityChange,
      );
    }
  }
}