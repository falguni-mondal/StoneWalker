/**
 * STONEWALKER — Settings & Accessibility Manager
 * Persists user settings to localStorage and syncs DOM attributes/CSS variables.
 */

import { CONFIG } from '../config';
import type { GameSettings, GraphicsQuality } from '../data/types';
import type { EventBus } from './EventBus';

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  sfxVolume: 0.85,
  musicVolume: 0.65,
  muted: false,
  graphicsQuality: 'auto',
  resolvedQuality: 'medium',
  hapticsEnabled: true,
  cameraSensitivity: 1.0,
  uiScale: 1.0,
  largeText: false,
  highContrast: false,
  reducedMotion: false,
  colorblindMode: false,
  floatingDamageNumbers: true,
  language: 'en',
};

export class SettingsManager {
  private settings: GameSettings;
  private readonly bus: EventBus;

  public constructor(bus: EventBus) {
    this.bus = bus;
    this.settings = this.loadFromStorage();
    this.applyToDOM();
  }

  private loadFromStorage(): GameSettings {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
      if (!raw) {
        return { ...DEFAULT_SETTINGS };
      }
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      const merged: GameSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
      if (merged.graphicsQuality !== 'auto') {
        merged.resolvedQuality = merged.graphicsQuality;
      }
      return merged;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(
        CONFIG.STORAGE_KEYS.SETTINGS,
        JSON.stringify(this.settings),
      );
    } catch {
      // Ignore storage quota errors in private browsing
    }
  }

  public get(): Readonly<GameSettings> {
    return this.settings;
  }

  public update(patch: Partial<GameSettings>): void {
    this.settings = {
      ...this.settings,
      ...patch,
    };
    if (
      patch.graphicsQuality &&
      patch.graphicsQuality !== 'auto'
    ) {
      this.settings.resolvedQuality = patch.graphicsQuality;
    }
    this.applyToDOM();
    this.saveToStorage();
    this.bus.emit('settings:changed', { settings: { ...this.settings } });
  }

  public setQuality(quality: GraphicsQuality): void {
    const resolved =
      quality === 'auto' ? this.settings.resolvedQuality : quality;
    this.update({ graphicsQuality: quality, resolvedQuality: resolved });
  }

  /**
   * Called by GameLoop when FPS stays below 40 in 'auto' mode.
   */
  public stepDownAutoQuality(currentFps: number): void {
    if (this.settings.graphicsQuality !== 'auto') {
      return;
    }
    const current = this.settings.resolvedQuality;
    const next: 'low' | 'medium' | 'high' =
      current === 'high' ? 'medium' : 'low';
    if (next !== current) {
      this.settings.resolvedQuality = next;
      this.saveToStorage();
      this.bus.emit('quality:autoAdjusted', {
        newQuality: next,
        fps: Math.round(currentFps),
      });
      this.bus.emit('settings:changed', { settings: { ...this.settings } });
    }
  }

  public applyToDOM(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(this.settings.uiScale));
    root.setAttribute(
      'data-high-contrast',
      String(this.settings.highContrast),
    );
    root.setAttribute('data-large-text', String(this.settings.largeText));
    root.setAttribute(
      'data-reduced-motion',
      String(this.settings.reducedMotion),
    );
    root.setAttribute('data-colorblind', String(this.settings.colorblindMode));
  }
}