/**
 * STONEWALKER — Bottom Build Carousel with Base-Level Unlock Progression
 * Displays which buildings are unlocked at your current Council Walker Base Level
 * and shows "🔒 Requires Base Lv.2 / Lv.3" on higher-tier buildings until you upgrade the Base.
 */

import { BUILDING_LIST } from '../data/buildings';
import type {
  BuildingDefinition,
  BuildingType,
  FactionState,
  ResourceType,
} from '../data/types';
import { ConstructionSystem } from '../systems/Construction';

export interface BuildSheetCallbacks {
  onSelectBuildingToPlace: (
    buildingType: Exclude<BuildingType, 'base'>,
  ) => void;
  onConfirmPlacement: () => void;
  onCancelPlacement: () => void;
  onUpdatePriority: (resource: ResourceType, value: number) => void;
}

export class BuildSheet {
  public readonly sheetEl: HTMLElement;
  public readonly confirmBarEl: HTMLElement;
  private readonly callbacks: BuildSheetCallbacks;
  private isOpen = false;

  public constructor(parent: HTMLElement, callbacks: BuildSheetCallbacks) {
    this.callbacks = callbacks;

    this.sheetEl = document.createElement('section');
    this.sheetEl.className = 'stone-panel';
    this.sheetEl.style.cssText = `
      position: fixed;
      bottom: calc(var(--safe-bottom) + 12px);
      left: 50%;
      transform: translateX(-50%);
      width: min(860px, 95vw);
      max-height: 62dvh;
      padding: 14px;
      display: none;
      flex-direction: column;
      gap: 10px;
      z-index: 28;
      overflow-y: auto;
    `;

    this.confirmBarEl = document.createElement('div');
    this.confirmBarEl.className = 'stone-panel';
    this.confirmBarEl.style.cssText = `
      position: fixed;
      bottom: calc(var(--safe-bottom) + 18px);
      left: 50%;
      transform: translateX(-50%);
      width: min(420px, 92vw);
      padding: 12px 16px;
      display: none;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      z-index: 32;
      border-color: var(--accent-gold);
    `;
    this.confirmBarEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:2px;text-align:center;">
        <strong id="place-label" style="font-size:0.95rem;color:var(--accent-gold);">Place Building</strong>
        <span id="place-status" style="font-size:0.78rem;color:var(--accent-success);font-weight:800;">
          ✓ Valid spot selected — Tap ground to move or Confirm below
        </span>
      </div>
      <div style="display:flex;gap:10px;width:100%;">
        <button id="place-confirm" class="sw-btn sw-btn-success" style="flex:1;min-height:42px;padding:8px 12px;font-size:0.86rem;white-space:normal;">
          ✓ Build Here
        </button>
        <button id="place-cancel" class="sw-btn sw-btn-danger" style="flex:1;min-height:42px;padding:8px 12px;font-size:0.86rem;white-space:normal;">
          ✕ Cancel
        </button>
      </div>
    `;

    parent.appendChild(this.sheetEl);
    parent.appendChild(this.confirmBarEl);

    this.confirmBarEl
      .querySelector('#place-confirm')
      ?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onConfirmPlacement();
      });
    this.confirmBarEl
      .querySelector('#place-cancel')
      ?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onCancelPlacement();
      });
  }

  public toggle(factionState: FactionState, baseLevel: number = 1): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.render(factionState, baseLevel);
      this.sheetEl.style.display = 'flex';
    } else {
      this.sheetEl.style.display = 'none';
    }
  }

  public close(): void {
    this.isOpen = false;
    this.sheetEl.style.display = 'none';
  }

  public showPlacementConfirmBar(
    visible: boolean,
    buildingName: string = '',
    isValid: boolean = true,
  ): void {
    this.confirmBarEl.style.display = visible ? 'flex' : 'none';
    const label = this.confirmBarEl.querySelector('#place-label');
    if (label && buildingName) {
      label.textContent = `Placing: ${buildingName}`;
    }
    this.updatePlacementValidity(isValid);
  }

  public updatePlacementValidity(isValid: boolean): void {
    const statusEl = this.confirmBarEl.querySelector(
      '#place-status',
    ) as HTMLElement | null;
    if (!statusEl) return;
    if (isValid) {
      statusEl.textContent =
        '✓ Valid location — Tap ground to adjust, or press Build Here';
      statusEl.style.color = 'var(--accent-success)';
    } else {
      statusEl.textContent =
        '⚠ Spot occupied — Will auto-snap to nearest open ground';
      statusEl.style.color = 'var(--accent-gold)';
    }
  }

  public render(factionState: FactionState, baseLevel: number = 1): void {
    const placeable = BUILDING_LIST.filter((b) => b.id !== 'base');

    const cardsHtml = placeable
      .map((b) => this.renderBuildingCard(b, factionState, baseLevel))
      .join('');

    const prioritiesHtml = (
      ['food', 'wood', 'stone', 'hide', 'bronze'] as ResourceType[]
    )
      .map(
        (r) => `
        <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;">
          <span style="min-width:48px;text-transform:capitalize;font-weight:800;">${r}</span>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value="${factionState.workerPriorities[r]}"
            data-prio-res="${r}"
            style="width:74px;accent-color:var(--accent-primary);"
          />
        </label>
      `,
      )
      .join('');

    this.sheetEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-size:1.05rem;color:var(--accent-gold);">🏗️ Build Camp (Current Base: Lv.${baseLevel})</strong>
          <span style="font-size:0.76rem;color:var(--text-muted);margin-left:8px;">Upgrade your Council Walker Base to unlock higher-tier buildings!</span>
        </div>
        <button id="build-sheet-close" class="sw-btn" style="min-height:34px;padding:4px 12px;">✕ Close</button>
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;">
        ${cardsHtml}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:1px solid var(--border-stone);padding-top:8px;">
        <span style="font-size:0.78rem;color:var(--text-muted);font-weight:800;">Idle Worker Priority Sliders:</span>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">${prioritiesHtml}</div>
      </div>
    `;

    this.sheetEl
      .querySelector('#build-sheet-close')
      ?.addEventListener('click', () => this.close());

    this.sheetEl.querySelectorAll('[data-build-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute(
          'data-build-id',
        ) as Exclude<BuildingType, 'base'>;
        this.close();
        this.callbacks.onSelectBuildingToPlace(id);
      });
    });

    this.sheetEl.querySelectorAll('[data-prio-res]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const target = e.currentTarget as HTMLInputElement;
        const res = target.getAttribute('data-prio-res') as ResourceType;
        this.callbacks.onUpdatePriority(res, Number(target.value));
      });
    });
  }

  private renderBuildingCard(
    def: BuildingDefinition,
    factionState: FactionState,
    baseLevel: number,
  ): string {
    const reqBaseLv = def.requiredBaseLevel ?? 1;
    const lockedByBase = baseLevel < reqBaseLv;
    const lockedByTech =
      def.requiredTech !== undefined &&
      !factionState.researchedTechs.includes(def.requiredTech);
    const isLocked = lockedByBase || lockedByTech;

    const affordable = ConstructionSystem.canAfford(
      factionState.resources,
      def.cost,
    );

    const costChips = Object.entries(def.cost)
      .map(([k, v]) => {
        const hasEnough =
          factionState.resources[k as ResourceType] >= (v ?? 0);
        const color = hasEnough ? 'var(--text-dark)' : 'var(--accent-danger)';
        return `<span style="color:${color};font-weight:900;font-size:0.75rem;">${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}</span>`;
      })
      .join(' · ');

    const lockMessage = lockedByBase
      ? `🔒 Upgrade Base to Lv.${reqBaseLv} to Unlock`
      : `🔒 Needs Tech: ${def.requiredTech?.replace('_', ' ')}`;

    return `
      <div class="parchment-card" style="min-width:215px;max-width:215px;padding:10px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;opacity:${isLocked ? '0.62' : '1'};">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
            <span style="font-weight:900;font-size:0.92rem;line-height:1.2;">${def.name}</span>
            <span style="font-size:0.68rem;font-weight:900;padding:2px 6px;border-radius:6px;background:rgba(0,0,0,0.12);">Base Lv.${reqBaseLv}</span>
          </div>
          <div style="font-size:0.73rem;margin-top:4px;line-height:1.25;">${def.tooltip}</div>
        </div>
        <div>
          <div style="margin-bottom:6px;line-height:1.2;">${costChips}</div>
          ${
            isLocked
              ? `<div style="font-size:0.73rem;color:var(--accent-danger);font-weight:900;white-space:normal;padding:6px 0;">${lockMessage}</div>`
              : `<button data-build-id="${def.id}" class="sw-btn ${affordable ? 'sw-btn-primary' : ''}" style="width:100%;min-height:38px;white-space:normal;">
                  Select & Place
                </button>`
          }
        </div>
      </div>
    `;
  }
}