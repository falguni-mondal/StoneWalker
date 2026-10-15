/**
 * STONEWALKER — Armory Global Tier Upgrades & Weapon Station Stock Sheet (Section 8)
 */

import {
  ARMOR_TIERS,
  WEAPON_STATION_ITEMS,
  WEAPON_STATION_STOCK_CAPS,
  WEAPON_TIERS,
} from '../data/equipment';
import { UNIT_LIST } from '../data/units';
import type {
  BuildingEntity,
  FactionState,
  UnitRole,
  WeaponStationItemType,
} from '../data/types';

export interface ArmoryPanelCallbacks {
  onUpgradeWeaponTier: (role: UnitRole) => void;
  onUpgradeArmorTier: (role: UnitRole) => void;
  onCraftEmergencyWeapon: (itemType: WeaponStationItemType) => void;
}

export class ArmoryPanel {
  public readonly container: HTMLElement;
  private readonly callbacks: ArmoryPanelCallbacks;
  private isOpen = false;

  public constructor(parent: HTMLElement, callbacks: ArmoryPanelCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('section');
    this.container.className = 'stone-panel';
    this.container.style.cssText = `
      position: fixed;
      bottom: calc(var(--safe-bottom) + 12px);
      left: 50%;
      transform: translateX(-50%);
      width: min(820px, 95vw);
      max-height: 62dvh;
      padding: 14px;
      display: none;
      flex-direction: column;
      gap: 10px;
      z-index: 28;
      overflow-y: auto;
    `;
    parent.appendChild(this.container);
  }

  public toggle(
    factionState: FactionState,
    weaponStation: BuildingEntity | null,
  ): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.render(factionState, weaponStation);
      this.container.style.display = 'flex';
    } else {
      this.container.style.display = 'none';
    }
  }

  public close(): void {
    this.isOpen = false;
    this.container.style.display = 'none';
  }

  public render(
    factionState: FactionState,
    weaponStation: BuildingEntity | null,
  ): void {
    const combatUnits = UNIT_LIST.filter((u) => u.id !== 'worker');

    const rowsHtml = combatUnits
      .map((u) => {
        const wTier = factionState.unitWeaponTiers[u.id];
        const aTier = factionState.unitArmorTiers[u.id];
        const wName = WEAPON_TIERS[wTier].name;
        const aName = ARMOR_TIERS[aTier].name;

        return `
          <div class="parchment-card" style="padding:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div>
              <strong style="font-size:0.95rem;">${u.name}</strong>
              <div style="font-size:0.78rem;">Weapon: ${wName} (T${wTier}) · Armor: ${aName} (T${aTier})</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button data-up-wpn="${u.id}" class="sw-btn sw-btn-primary" style="min-height:38px;font-size:0.8rem;" ${wTier >= 3 ? 'disabled' : ''}>
                ${wTier >= 3 ? 'Max Weapon' : `Upgrade Weapon → T${wTier + 1}`}
              </button>
              <button data-up-arm="${u.id}" class="sw-btn" style="min-height:38px;font-size:0.8rem;" ${aTier >= 3 ? 'disabled' : ''}>
                ${aTier >= 3 ? 'Max Armor' : `Upgrade Armor → T${aTier + 1}`}
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    const stock = weaponStation?.weaponStock ?? { club: 0, spear: 0, sling: 0 };
    const cap = weaponStation
      ? WEAPON_STATION_STOCK_CAPS[weaponStation.level - 1] ?? 6
      : 0;
    const totalStock = stock.club + stock.spear + stock.sling;

    const stationHtml = weaponStation
      ? `
        <div style="border-top:1px solid var(--border-stone);padding-top:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong style="color:var(--accent-gold);">Weapon Station Emergency Stock (${totalStock}/${cap})</strong>
            <span style="font-size:0.78rem;color:var(--text-muted);">Clubs: ${stock.club} · Spears: ${stock.spear} · Slings: ${stock.sling}</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${(['club', 'spear', 'sling'] as WeaponStationItemType[])
              .map(
                (item) => `
                  <button data-craft-wpn="${item}" class="sw-btn" style="min-height:38px;">
                    Craft ${WEAPON_STATION_ITEMS[item].name} (+1)
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>
      `
      : `<div style="font-size:0.82rem;color:var(--text-muted);">Build a Weapon Station to stock emergency Clubs, Spears, and Slings for Workers during Base Alarms.</div>`;

    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <strong style="font-size:1.1rem;color:var(--accent-gold);">Tribal Armory & Weapon Station</strong>
        <button id="armory-close" class="sw-btn" style="min-height:36px;padding:4px 12px;">Close</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${rowsHtml}
      </div>
      ${stationHtml}
    `;

    this.container
      .querySelector('#armory-close')
      ?.addEventListener('click', () => this.close());

    this.container.querySelectorAll('[data-up-wpn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = (btn as HTMLElement).getAttribute(
          'data-up-wpn',
        ) as UnitRole;
        this.callbacks.onUpgradeWeaponTier(role);
        this.render(factionState, weaponStation);
      });
    });

    this.container.querySelectorAll('[data-up-arm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = (btn as HTMLElement).getAttribute(
          'data-up-arm',
        ) as UnitRole;
        this.callbacks.onUpgradeArmorTier(role);
        this.render(factionState, weaponStation);
      });
    });

    this.container.querySelectorAll('[data-craft-wpn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = (btn as HTMLElement).getAttribute(
          'data-craft-wpn',
        ) as WeaponStationItemType;
        this.callbacks.onCraftEmergencyWeapon(item);
        this.render(factionState, weaponStation);
      });
    });
  }
}