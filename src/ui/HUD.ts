/**
 * STONEWALKER — Unified Single-Flow Mobile-Friendly Top Resource & Utility Bar
 * Includes one-tap Save (💾), Load (📂), Restart Level (🔄), Rotate (↻), Pause (⏸), and Menu (☰).
 */

import type { DayNightLighting } from '../core/DayNight';
import type {
  FactionState,
  ResourceType,
  Vec2,
  WeatherType,
} from '../data/types';
import type { ObjectiveProgress } from '../systems/Victory';

export interface HUDCallbacks {
  onRotateCamera: () => void;
  onTogglePause: () => boolean;
  onSaveGame: () => void;
  onLoadGame: () => void;
  onRestartLevel: () => void;
  onOpenMainMenu: () => void;
  onJumpToPosition: (pos: Vec2) => void;
}

const RESOURCE_SVGS: Record<ResourceType, string> = {
  food: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444"><circle cx="9" cy="14" r="5"/><circle cx="15" cy="15" r="4.5"/><path d="M12 4c0 4-3 6-3 6s4 0 6-3c1-1.5 0-3-3-3z" fill="#6f9c4a"/></svg>`,
  wood: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#b47b44"><rect x="3" y="6" width="18" height="5" rx="2"/><rect x="5" y="13" width="16" height="5" rx="2"/><circle cx="19" cy="8.5" r="1.5" fill="#e6ccb2"/></svg>`,
  stone: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#9ca3af"><polygon points="12,3 21,9 18,20 6,20 3,9"/><polygon points="12,3 18,20 6,20" fill="#cbd5e1" opacity="0.45"/></svg>`,
  hide: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#d99b52"><path d="M6 4l4 2h4l4-2 2 5-2 3 2 6-4 2H8l-4-2 2-6-2-3z"/></svg>`,
  bronze: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b"><polygon points="12,2 20,8 17,21 7,21 4,8"/><polygon points="12,4 16,9 12,19" fill="#fde68a" opacity="0.6"/></svg>`,
};

const POP_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#60a5fa"><circle cx="9" cy="7" r="4"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6"/><circle cx="17" cy="8" r="3" opacity="0.8"/><path d="M16 14c3 0 6 1.5 6 5" opacity="0.8"/></svg>`;

const RESOURCE_TOOLTIPS: Record<ResourceType, string> = {
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  hide: 'Hide',
  bronze: 'Bronze Ore',
};

export class HUD {
  public readonly wrapper: HTMLElement;
  public readonly element: HTMLElement;
  private readonly objectivesBar: HTMLElement;
  private readonly debugPanel: HTMLElement;
  private readonly callbacks: HUDCallbacks;

  private readonly resValueEls = new Map<ResourceType, HTMLElement>();
  private readonly resFillEls = new Map<ResourceType, HTMLElement>();
  private popEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private weatherEl!: HTMLElement;
  private pauseBtn!: HTMLButtonElement;

  private objectivesCollapsed = false;
  private debugVisible = false;
  private logoTapCount = 0;
  private logoLastTapTime = 0;
  private lastObjectivesKey = '';

  public constructor(parent: HTMLElement, callbacks: HUDCallbacks) {
    this.callbacks = callbacks;

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'top-hud-wrapper';

    this.element = document.createElement('header');
    this.element.className = 'top-bar';

    this.objectivesBar = document.createElement('div');
    this.objectivesBar.className = 'stone-panel objectives-banner';

    this.debugPanel = document.createElement('div');
    this.debugPanel.className = 'stone-panel';
    this.debugPanel.style.cssText =
      'align-self:flex-end;padding:5px 9px;font-size:0.72rem;display:none;';

    this.buildDOM();
    this.wrapper.append(this.element, this.objectivesBar, this.debugPanel);
    parent.appendChild(this.wrapper);
  }

  private buildDOM(): void {
    const brandChip = document.createElement('button');
    brandChip.className = 'sw-btn top-icon-btn';
    brandChip.innerHTML = `<span style="color:var(--accent-gold);font-weight:900;">⚔</span>`;
    brandChip.title = 'Stonewalker (Triple-tap for Debug)';
    brandChip.addEventListener('click', () => {
      const now = performance.now();
      if (now - this.logoLastTapTime < 450) {
        this.logoTapCount += 1;
        if (this.logoTapCount >= 3) {
          this.toggleDebugPanel();
          this.logoTapCount = 0;
        }
      } else {
        this.logoTapCount = 1;
      }
      this.logoLastTapTime = now;
    });
    this.element.appendChild(brandChip);

    const types: ResourceType[] = ['food', 'wood', 'stone', 'hide', 'bronze'];
    for (const rType of types) {
      const chip = document.createElement('div');
      chip.className = 'resource-chip';
      chip.title = `${RESOURCE_TOOLTIPS[rType]} (Max 10,000+)`;

      const row = document.createElement('div');
      row.className = 'resource-chip-row';
      const iconSpan = document.createElement('span');
      iconSpan.style.cssText = 'display:inline-flex;align-items:center;';
      iconSpan.innerHTML = RESOURCE_SVGS[rType];

      const valSpan = document.createElement('span');
      valSpan.textContent = '0';
      row.append(iconSpan, valSpan);

      const bar = document.createElement('div');
      bar.className = 'resource-cap-bar';
      const fill = document.createElement('div');
      fill.className = 'resource-cap-fill';
      fill.style.width = '0%';
      bar.appendChild(fill);

      chip.append(row, bar);
      this.element.appendChild(chip);

      this.resValueEls.set(rType, valSpan);
      this.resFillEls.set(rType, fill);
    }

    const popChip = document.createElement('div');
    popChip.className = 'resource-chip';
    popChip.title = 'Population / Housing Cap';
    const popRow = document.createElement('div');
    popRow.className = 'resource-chip-row';
    const popIcon = document.createElement('span');
    popIcon.style.cssText = 'display:inline-flex;align-items:center;';
    popIcon.innerHTML = POP_SVG;
    this.popEl = document.createElement('span');
    this.popEl.textContent = '4/20';
    popRow.append(popIcon, this.popEl);
    popChip.appendChild(popRow);
    this.element.appendChild(popChip);

    this.clockEl = document.createElement('div');
    this.clockEl.className = 'sw-btn top-icon-btn';
    this.clockEl.style.pointerEvents = 'none';
    this.clockEl.textContent = '☀ 08:00';

    this.weatherEl = document.createElement('div');
    this.weatherEl.className = 'sw-btn top-icon-btn';
    this.weatherEl.style.pointerEvents = 'none';
    this.weatherEl.title = 'Current Weather';
    this.weatherEl.textContent = '☀';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'sw-btn sw-btn-success top-icon-btn';
    saveBtn.title = 'Save Game to Active Slot';
    saveBtn.textContent = '💾';
    saveBtn.addEventListener('click', () => this.callbacks.onSaveGame());

    const loadBtn = document.createElement('button');
    loadBtn.className = 'sw-btn top-icon-btn';
    loadBtn.title = 'Open Saved Games (3 Slots)';
    loadBtn.textContent = '📂';
    loadBtn.addEventListener('click', () => this.callbacks.onLoadGame());

    const restartBtn = document.createElement('button');
    restartBtn.className = 'sw-btn sw-btn-danger top-icon-btn';
    restartBtn.title = 'Restart Current Level';
    restartBtn.textContent = '🔄';
    restartBtn.addEventListener('click', () => this.callbacks.onRestartLevel());

    const rotateBtn = document.createElement('button');
    rotateBtn.className = 'sw-btn top-icon-btn';
    rotateBtn.title = 'Rotate Camera 90° (Q/E)';
    rotateBtn.textContent = '↻';
    rotateBtn.addEventListener('click', () => this.callbacks.onRotateCamera());

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'sw-btn top-icon-btn';
    this.pauseBtn.title = 'Pause / Resume (Space)';
    this.pauseBtn.textContent = '⏸';
    this.pauseBtn.addEventListener('click', () => {
      const paused = this.callbacks.onTogglePause();
      this.setPauseButtonLabel(paused);
    });

    const menuBtn = document.createElement('button');
    menuBtn.className = 'sw-btn sw-btn-primary top-icon-btn';
    menuBtn.title = 'Main Menu & Settings';
    menuBtn.textContent = '☰';
    menuBtn.addEventListener('click', () => this.callbacks.onOpenMainMenu());

    this.element.append(
      this.clockEl,
      this.weatherEl,
      saveBtn,
      loadBtn,
      restartBtn,
      rotateBtn,
      this.pauseBtn,
      menuBtn,
    );
  }

  public setPauseButtonLabel(paused: boolean): void {
    this.pauseBtn.textContent = paused ? '▶' : '⏸';
  }

  public update(
    faction: FactionState,
    lighting: DayNightLighting,
    weather: WeatherType,
    levelTitle: string,
    objectives: readonly ObjectiveProgress[],
    debugStats: {
      fps: number;
      entityCount: number;
      aiState: string;
      seed: number;
    },
  ): void {
    const types: ResourceType[] = ['food', 'wood', 'stone', 'hide', 'bronze'];
    for (const t of types) {
      const cur = Math.floor(faction.resources[t]);
      const cap = Math.max(1, faction.storageCaps[t]);
      const valEl = this.resValueEls.get(t);
      const fillEl = this.resFillEls.get(t);
      if (valEl) {
        valEl.textContent = String(cur);
      }
      if (fillEl) {
        const pct = Math.min(100, Math.round((cur / cap) * 100));
        fillEl.style.width = `${pct}%`;
      }
    }

    this.popEl.textContent = `${faction.populationUsed}/${faction.populationCap}`;
    this.clockEl.textContent = `${lighting.isNight ? '🌙' : '☀'} ${lighting.formattedClock}`;
    const weatherIcon =
      weather === 'rain'
        ? '🌧'
        : weather === 'snow'
          ? '❄'
          : weather === 'fog'
            ? '🌫'
            : '☀';
    this.weatherEl.textContent = weatherIcon;
    this.weatherEl.title = `Weather: ${weather.charAt(0).toUpperCase() + weather.slice(1)}`;

    const objKey = `${this.objectivesCollapsed}:${levelTitle}:${objectives.map((o) => `${o.objective.id}=${o.currentValue}:${o.completed}`).join('|')}`;
    if (objKey !== this.lastObjectivesKey) {
      this.lastObjectivesKey = objKey;
      const rows = this.objectivesCollapsed
        ? ''
        : objectives
            .map((o) => {
              const check = o.completed ? '✓' : '◎';
              const color = o.completed
                ? 'var(--accent-success)'
                : o.objective.isBonus
                  ? 'var(--accent-gold)'
                  : 'var(--text-light)';
              const jumpAttr = o.objective.targetPosition
                ? `data-jump-x="${o.objective.targetPosition.x}" data-jump-z="${o.objective.targetPosition.z}" style="color:${color};cursor:pointer;text-decoration:underline;"`
                : `style="color:${color};"`;
              return `<div ${jumpAttr}>${check}${o.objective.description}</div>`;
            })
            .join('');

      this.objectivesBar.innerHTML = `
        <div id="obj-toggle-hdr" style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;">
          <strong style="color:var(--accent-gold);font-size:0.74rem;">🎯 ${levelTitle}</strong>
          <span style="color:var(--accent-gold);font-weight:900;">${this.objectivesCollapsed ? '▸' : '▾'}</span>
        </div>
        ${rows}
      `;

      this.objectivesBar
        .querySelector('#obj-toggle-hdr')
        ?.addEventListener('click', () => {
          this.objectivesCollapsed = !this.objectivesCollapsed;
          this.lastObjectivesKey = '';
        });

      this.objectivesBar.querySelectorAll('[data-jump-x]').forEach((el) => {
        el.addEventListener('click', () => {
          const x = Number((el as HTMLElement).getAttribute('data-jump-x'));
          const z = Number((el as HTMLElement).getAttribute('data-jump-z'));
          this.callbacks.onJumpToPosition({ x, z });
        });
      });
    }

    if (this.debugVisible) {
      this.debugPanel.innerHTML = `
        <div><strong>FPS:</strong> ${debugStats.fps} · <strong>Entities:</strong>${debugStats.entityCount}</div>
        <div><strong>Seed:</strong> ${debugStats.seed} · <strong>AI:</strong>${debugStats.aiState}</div>
      `;
    }
  }

  public toggleDebugPanel(): void {
    this.debugVisible = !this.debugVisible;
    this.debugPanel.style.display = this.debugVisible ? 'block' : 'none';
  }
}