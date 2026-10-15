/**
 * STONEWALKER — Spirit Power Sheet & Compact Hero Ability Icon Button (Sections 8B & 16)
 * Hero Ability button is a compact 48x48 icon button inside the bottom-left Orders dock.
 */

import { HEROES } from '../data/heroes';
import { SPIRIT_POWER_LIST } from '../data/powers';
import type {
  BuildingEntity,
  FactionState,
  SpiritPowerId,
  UnitEntity,
} from '../data/types';
import { PowersSystem } from '../systems/Powers';

export interface PowerBarCallbacks {
  onSelectSpiritPowerToAim: (powerId: SpiritPowerId) => void;
  onTriggerHeroAbility: () => void;
}

const HERO_ABILITY_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15,8 22,9 17,14 18,21 12,17.5 6,21 7,14 2,9 9,8"/></svg>`;

export class PowerBar {
  public readonly sheetEl: HTMLElement;
  public readonly heroBtnEl: HTMLButtonElement;
  private readonly heroSubEl: HTMLElement;
  private readonly callbacks: PowerBarCallbacks;
  private isOpen = false;
  private aimingPowerId: SpiritPowerId | null = null;

  public constructor(
    sheetParent: HTMLElement,
    heroButtonContainer: HTMLElement,
    callbacks: PowerBarCallbacks,
  ) {
    this.callbacks = callbacks;

    this.heroBtnEl = document.createElement('button');
    this.heroBtnEl.className = 'sw-btn sw-btn-primary sw-icon-btn';
    this.heroBtnEl.title = 'Chieftain Hero Active Ability [H]';
    this.heroBtnEl.innerHTML = `
      ${HERO_ABILITY_SVG}
      <span class="icon-btn-sub">Hero ★</span>
    `;
    this.heroSubEl = this.heroBtnEl.querySelector(
      '.icon-btn-sub',
    ) as HTMLElement;
    this.heroBtnEl.addEventListener('click', () =>
      this.callbacks.onTriggerHeroAbility(),
    );

    this.sheetEl = document.createElement('section');
    this.sheetEl.className = 'stone-panel';
    this.sheetEl.style.cssText = `
      position: fixed;
      bottom: calc(var(--safe-bottom) + 66px);
      left: 50%;
      transform: translateX(-50%);
      width: min(680px, 94vw);
      padding: 12px;
      display: none;
      flex-direction: column;
      gap: 10px;
      z-index: 28;
    `;

    heroButtonContainer.prepend(this.heroBtnEl);
    sheetParent.appendChild(this.sheetEl);
  }

  public setAimingPower(powerId: SpiritPowerId | null): void {
    this.aimingPowerId = powerId;
  }

  public getAimingPower(): SpiritPowerId | null {
    return this.aimingPowerId;
  }

  public toggleSheet(
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
  ): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.renderSheet(factionState, buildings);
      this.sheetEl.style.display = 'flex';
    } else {
      this.sheetEl.style.display = 'none';
    }
  }

  public close(): void {
    this.isOpen = false;
    this.sheetEl.style.display = 'none';
  }

  public updateHeroButton(
    hero: UnitEntity | null,
    factionState: FactionState,
  ): void {
    const heroDef = HEROES[factionState.tribe];
    this.heroBtnEl.title = `${heroDef.name}: ${heroDef.abilityName} [H]`;
    if (!hero || hero.isReviving || hero.hp <= 0) {
      const rev = hero ? Math.ceil(hero.reviveTimer) : 0;
      this.heroSubEl.textContent = `${rev}s`;
      this.heroBtnEl.disabled = true;
      return;
    }
    this.heroBtnEl.disabled = false;
    const cd = Math.ceil(hero.heroAbilityCooldownTimer);
    this.heroSubEl.textContent = cd > 0 ? `${cd}s` : 'Hero ★';
  }

  public renderSheet(
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
  ): void {
    const bldArray = Array.from(buildings);
    const cardsHtml = SPIRIT_POWER_LIST.map((p) => {
      const unlocked = PowersSystem.isPowerUnlocked(
        p.id,
        factionState,
        bldArray,
      );
      const cd = Math.ceil(factionState.powerCooldowns[p.id] ?? 0);
      const ready = unlocked && cd <= 0;

      return `
        <div class="parchment-card" style="min-width:175px;flex:1;padding:10px;display:flex;flex-direction:column;justify-content:space-between;gap:6px;opacity:${unlocked ? '1' : '0.65'};">
          <div>
            <strong style="font-size:0.9rem;">${p.name}</strong>
            <div style="font-size:0.73rem;margin-top:2px;">${p.description}</div>
          </div>
          ${
            !unlocked
              ? `<div style="font-size:0.73rem;color:var(--accent-danger);font-weight:800;">Upgrade Spirit Totem or Lab</div>`
              : `<button data-power-id="${p.id}" class="sw-btn ${ready ? 'sw-btn-primary' : ''}" style="width:100%;min-height:36px;" ${ready ? '' : 'disabled'}>
                  ${cd > 0 ? `Recharging (${cd}s)` : 'Aim & Cast'}
                </button>`
          }
        </div>
      `;
    }).join('');

    this.sheetEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <strong style="font-size:1rem;color:var(--accent-gold);">⚡ Spirit Powers (Tap Ground to Cast)</strong>
        <button id="power-sheet-close" class="sw-btn" style="min-height:32px;padding:4px 10px;">✕</button>
      </div>
      <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">
        ${cardsHtml}
      </div>
    `;

    this.sheetEl
      .querySelector('#power-sheet-close')
      ?.addEventListener('click', () => this.close());

    this.sheetEl.querySelectorAll('[data-power-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = (btn as HTMLElement).getAttribute(
          'data-power-id',
        ) as SpiritPowerId;
        this.close();
        this.callbacks.onSelectSpiritPowerToAim(pid);
      });
    });
  }
}