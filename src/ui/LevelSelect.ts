/**
 * STONEWALKER — Non-Overflowing Campaign Map & Tribe Selector Screen (Sections 11, 13 & 16)
 * Uses `.tribe-select-card` with wrapped text, Chieftain Hero badges, and clean responsive
 * level cards so no text ever clips or overflows horizontally.
 */

import { HEROES, TRIBE_LIST } from '../data/heroes';
import { CAMPAIGN_LEVELS } from '../data/levels';
import type { LevelDefinition, TribeId } from '../data/types';

export interface LevelSelectCallbacks {
  onLaunchLevel: (level: LevelDefinition, tribe: TribeId) => void;
  onBackToMainMenu: () => void;
}

export class LevelSelectScreen {
  public readonly container: HTMLElement;
  private readonly callbacks: LevelSelectCallbacks;
  private selectedTribe: TribeId = 'stonebacks';

  public constructor(parent: HTMLElement, callbacks: LevelSelectCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('section');
    this.container.className = 'stone-panel';
    this.container.style.cssText = `
      position: fixed;
      inset: calc(var(--safe-top) + 10px) calc(var(--safe-right) + 10px) calc(var(--safe-bottom) + 10px) calc(var(--safe-left) + 10px);
      padding: 16px;
      display: none;
      flex-direction: column;
      gap: 14px;
      z-index: 42;
      overflow-y: auto;
      overflow-x: hidden;
    `;
    parent.appendChild(this.container);
  }

  public show(starsByLevel: Readonly<Record<number, number>>): void {
    this.render(starsByLevel);
    this.container.style.display = 'flex';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  private render(starsByLevel: Readonly<Record<number, number>>): void {
    const totalStars = Object.values(starsByLevel).reduce(
      (sum, s) => sum + s,
      0,
    );

    const tribeCards = TRIBE_LIST.map((t) => {
      const isSelected = this.selectedTribe === t.id;
      const hero = HEROES[t.id];
      return `
        <button
          data-tribe-pick="${t.id}"
          class="tribe-select-card ${isSelected ? 'active' : ''}"
        >
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:6px;">
            <strong style="font-size:0.96rem;">${isSelected ? '✓ ' : ''}${t.name}</strong>
            <span class="tribe-hero-badge">👑 ${hero.name}</span>
          </div>
          <div style="font-size:0.78rem;line-height:1.35;opacity:0.95;">
            ${t.description}
          </div>
          <div style="font-size:0.71rem;font-weight:800;opacity:0.85;">
            Hero Ability: ${hero.abilityName}
          </div>
        </button>
      `;
    }).join('');

    const levelCards = CAMPAIGN_LEVELS.map((lvl) => {
      const earned = starsByLevel[lvl.id] ?? 0;
      const prevEarned = lvl.id === 1 ? 3 : (starsByLevel[lvl.id - 1] ?? 0);
      const unlocked =
        lvl.id === 1 || prevEarned >= 1 || totalStars >= (lvl.id - 1) * 2;
      const starBadges = '★'.repeat(earned) + '☆'.repeat(3 - earned);
      const cleanName = lvl.name.replace('TheTimberland', 'The Timberland');

      return `
        <div class="parchment-card" style="padding:14px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;opacity:${unlocked ? '1' : '0.72'};">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <strong style="font-size:1.02rem;line-height:1.25;">${lvl.id}. ${cleanName}</strong>
              <span style="color:#b57c1e;font-size:1.08rem;font-weight:900;flex-shrink:0;">${starBadges}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-size:0.72rem;font-weight:900;padding:2px 7px;border-radius:6px;background:rgba(0,0,0,0.1);color:#4a3928;">
                📐 ${lvl.size}×${lvl.size} Map
              </span>
              <span style="font-size:0.75rem;font-weight:800;color:#5e4934;">
                ${lvl.subtitle.split('—')[0]?.trim() ?? lvl.subtitle}
              </span>
            </div>
            <p style="font-size:0.79rem;line-height:1.4;margin:4px 0 0 0;color:#33271d;">
              ${lvl.storyIntro}
            </p>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(0,0,0,0.12);padding-top:8px;">
            <div style="font-size:0.73rem;font-weight:800;color:#5c452d;line-height:1.3;">
              🏆 <strong>3★ Goal:</strong> ${lvl.threeStarBonusText}
            </div>
            <button data-launch-lvl="${lvl.id}" class="sw-btn ${unlocked ? 'sw-btn-primary' : ''}" style="width:100%;min-height:40px;">
              ▶ Play Level ${lvl.id}
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-bottom:1px solid var(--border-stone);padding-bottom:10px;">
        <div>
          <h2 style="margin:0;font-size:1.35rem;color:var(--accent-gold);line-height:1.2;">Campaign Map — The Prehistoric March</h2>
          <span style="font-size:0.82rem;color:var(--text-muted);font-weight:800;">Total Campaign Stars: ${totalStars} / 24 ★</span>
        </div>
        <button id="lvl-back-btn" class="sw-btn" style="min-height:38px;">← Welcome Screen</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="font-size:0.84rem;font-weight:900;color:var(--accent-gold);">1. Choose Your Tribe & Chieftain Hero:</div>
        <div class="tribe-selector-grid">${tribeCards}</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="font-size:0.84rem;font-weight:900;color:var(--accent-gold);">2. Select Campaign Mission (8 Large Levels):</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(275px,1fr));gap:12px;">
          ${levelCards}
        </div>
      </div>
    `;

    this.container
      .querySelector('#lvl-back-btn')
      ?.addEventListener('click', () => {
        this.hide();
        this.callbacks.onBackToMainMenu();
      });

    this.container.querySelectorAll('[data-tribe-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedTribe = (btn as HTMLElement).getAttribute(
          'data-tribe-pick',
        ) as TribeId;
        this.render(starsByLevel);
      });
    });

    this.container.querySelectorAll('[data-launch-lvl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(
          (btn as HTMLElement).getAttribute('data-launch-lvl'),
        );
        const lvl = CAMPAIGN_LEVELS.find((l) => l.id === id);
        if (lvl) {
          this.hide();
          this.callbacks.onLaunchLevel(lvl, this.selectedTribe);
        }
      });
    });
  }
}