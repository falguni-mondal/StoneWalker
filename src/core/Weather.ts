/**
 * STONEWALKER — Weather System (Section 4)
 * Manages level-themed weather (clear, rain, fog, snow) and exposes gameplay
 * multipliers for fire damage, unit vision, and movement speed.
 */

import { BALANCE } from '../data/balance';
import type { MapTheme, WeatherType } from '../data/types';
import type { EventBus } from './EventBus';
import type { RNG } from './RNG';

export interface WeatherSerializedState {
  currentWeather: WeatherType;
  timerSec: number;
  nextChangeSec: number;
  theme: MapTheme;
}

const THEME_WEATHER_POOL: Record<MapTheme, readonly WeatherType[]> = {
  green_valley: ['clear', 'clear', 'rain'],
  ancient_forest: ['clear', 'rain', 'fog'],
  misty_swamp: ['fog', 'rain', 'clear'],
  arid_desert: ['clear', 'clear', 'clear'],
  frost_peaks: ['snow', 'snow', 'clear', 'fog'],
  volcanic_crag: ['clear', 'fog'],
  river_crossings: ['clear', 'rain', 'fog'],
  titan_plateau: ['clear', 'rain', 'snow', 'fog'],
};

export class WeatherController {
  private readonly bus: EventBus;
  private currentWeather: WeatherType;
  private theme: MapTheme;
  private timerSec = 0;
  private nextChangeSec = 95;

  public constructor(
    bus: EventBus,
    initialWeather: WeatherType = 'clear',
    theme: MapTheme = 'green_valley',
  ) {
    this.bus = bus;
    this.currentWeather = initialWeather;
    this.theme = theme;
  }

  public update(dt: number, rng: RNG): void {
    this.timerSec += dt;
    if (this.timerSec < this.nextChangeSec) {
      return;
    }
    this.timerSec = 0;
    this.nextChangeSec = rng.nextFloat(75, 135);

    const pool = THEME_WEATHER_POOL[this.theme];
    const picked = rng.pick(pool);
    if (picked !== this.currentWeather) {
      this.setWeather(picked, true);
    }
  }

  public setWeather(weather: WeatherType, announce: boolean = true): void {
    if (this.currentWeather === weather) {
      return;
    }
    this.currentWeather = weather;
    this.bus.emit('weather:changed', { weather });
    if (announce) {
      const labelMap: Record<WeatherType, string> = {
        clear: 'Skies have cleared.',
        rain: 'Rain begins to fall — fire weapons weakened.',
        fog: 'Dense mist rolls in — unit vision reduced.',
        snow: 'Snowfall settles — unit movement slightly slowed.',
      };
      this.bus.emit('ui:toast', {
        message: labelMap[weather],
        level: 'info',
      });
    }
  }

  public setTheme(theme: MapTheme, defaultWeather: WeatherType): void {
    this.theme = theme;
    this.timerSec = 0;
    this.setWeather(defaultWeather, false);
  }

  public getWeather(): WeatherType {
    return this.currentWeather;
  }

  public getFireDamageMultiplier(): number {
    return this.currentWeather === 'rain'
      ? BALANCE.WEATHER_RAIN_FIRE_DAMAGE_MULTIPLIER
      : 1.0;
  }

  public getVisionMultiplier(): number {
    return this.currentWeather === 'fog'
      ? BALANCE.WEATHER_FOG_VISION_MULTIPLIER
      : 1.0;
  }

  public getSpeedMultiplier(): number {
    return this.currentWeather === 'snow'
      ? BALANCE.WEATHER_SNOW_SPEED_MULTIPLIER
      : 1.0;
  }

  public getState(): WeatherSerializedState {
    return {
      currentWeather: this.currentWeather,
      timerSec: this.timerSec,
      nextChangeSec: this.nextChangeSec,
      theme: this.theme,
    };
  }

  public setState(state: WeatherSerializedState): void {
    this.currentWeather = state.currentWeather;
    this.timerSec = state.timerSec;
    this.nextChangeSec = state.nextChangeSec;
    this.theme = state.theme;
  }
}