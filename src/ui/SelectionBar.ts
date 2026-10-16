/**
 * STONEWALKER — Event-Safe Realtime Stats & Orders Popup (with Destroy Building Option)
 * - Uses smart DOM diffing (`lastStructureKey`) so `innerHTML` is only rebuilt when state
 *   changes, while live HP and queue progress update in-place.
 * - Includes a `🗑️ Destroy` button on buildings to demolish them and refund 50% resources.
 */

import { BASE_TIER_STATS, BUILDINGS } from '../data/buildings';
import { ARMOR_TIERS, WEAPON_TIERS } from '../data/equipment';
import { HEROES } from '../data/heroes';
import { MACHINES } from '../data/machines';
import { UNITS } from '../data/units';
import type {
  BuildingEntity,
  BuildingType,
  EntityId,
  FactionState,
  MachineRole,
  UnitEntity,
  UnitRole,
} from '../data/types';

export interface SelectionBarCallbacks {
  onToggleStructureMode: (buildingId: EntityId) => void;
  onRelocateSelectedBuildings: () => void;
  onTrainItem: (buildingId: EntityId, itemType: string) => void;
  onToggleRepeatQueue: (buildingId: EntityId) => void;
  onUpgradeBuilding: (buildingId: EntityId) => void;
  onDestroyBuilding: (buildingId: EntityId) => void;
  onToggleUnitStance: () => void;
  onStopSelected: () => void;
  onCollapse: () => void;
}

export function getBuildingLevelRewardText(
  buildingType: BuildingType,
  nextLevel: number,
): string {
  switch (buildingType) {
    case 'base':
      return nextLevel === 2
        ? '+50% HP/ATK & Unlocks 6 Tier-2 Camp Buildings'
        : '+50% HP/ATK & Unlocks Machine Workshop + Bronze Mine';
    case 'barracks':
      return nextLevel === 2
        ? '+45% HP & Unlocks Shield Bearer'
        : '+45% HP, Unlocks Bronze Gear & +20% Melee HP';
    case 'sling_range':
      return nextLevel === 2
        ? '+45% HP & Unlocks Bow Hunter'
        : '+45% HP & Unlocks Bone Shaman';
    case 'machine_workshop':
      return nextLevel === 2
        ? '+45% HP & Unlocks Boulder Thrower + Shell Walker'
        : '+45% HP & Unlocks Fire Catapult + Mammoth + Titan';
    case 'beast_pen':
      return nextLevel === 2
        ? '+45% HP & Summons Tamed Sabertooth'
        : '+45% HP & Summons Tamed War Mammoth';
    case 'spirit_totem':
      return nextLevel === 2
        ? '+45% HP, Unlocks Rally Roar + Fire Rain & Boosts Hero'
        : '+45% HP, Unlocks Earthquake & Boosts/Revives Hero';
    case 'armory':
      return nextLevel === 2
        ? '+45% HP & Unlocks Bone Weapon/Armor Tier 2'
        : '+45% HP & Unlocks Bronze Weapon/Armor Tier 3';
    case 'research_hall':
      return nextLevel === 2
        ? '+45% HP & +20% Gather Speed (Bone Age)'
        : '+45% HP & +25% Carry/Gather (Bronze Age)';
    default:
      return '+45% Max HP & +35% Output/Capacity';
  }
}

export class SelectionBar {
  public readonly container: HTMLElement;
  private readonly callbacks: SelectionBarCallbacks;
  private travelEstimateText: string | null = null;
  private popupOpen = false;
  private lastStructureKey = '';

  public constructor(parent: HTMLElement, callbacks: SelectionBarCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('section');
    this.container.className = 'stone-panel selection-card-dock';
    parent.appendChild(this.container);
  }

  public isPopupOpen(): boolean {
    return this.popupOpen;
  }

  public setPopupOpen(open: boolean): void {
    if (this.popupOpen !== open) {
      this.popupOpen = open;
      this.lastStructureKey = '';
      if (!open) {
        this.container.style.display = 'none';
      }
    }
  }

  public togglePopup(): boolean {
    this.setPopupOpen(!this.popupOpen);
    return this.popupOpen;
  }

  public invalidate(): void {
    this.lastStructureKey = '';
  }

  public setTravelEstimate(text: string | null): void {
    if (this.travelEstimateText !== text) {
      this.travelEstimateText = text;
      this.lastStructureKey = '';
    }
  }

  private getPortraitSvg(roleOrType: string): string {
    switch (roleOrType) {
      case 'base':
        return `<svg width="26" height="26" viewBox="0 0 24 24" fill="#f2be49"><polygon points="12,2 20,7 18,18 6,18 4,7"/><rect x="5" y="18" width="3" height="5"/><rect x="16" y="18" width="3" height="5"/><circle cx="12" cy="11" r="3" fill="#ff6b22"/></svg>`;
      case 'worker':
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="#f2be49"><path d="M14 4l6 6-2 2-6-6 2-2zM4 20l9-9 2 2-9 9H4v-2z"/></svg>`;
      case 'spearman':
      case 'clubber':
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="#f07b2c"><polygon points="19,3 21,5 8,18 6,16"/><polygon points="21,3 15,5 19,9" fill="#fdf6e7"/></svg>`;
      case 'shield_bearer':
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="#60a5fa"><path d="M12 2L4 5v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V5l-8-3z"/></svg>`;
      case 'slinger':
      case 'bow_hunter':
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="#74d156"><path d="M5 3c9 2 14 7 16 16M5 3l14 14M19 5l-9 9" stroke="#f2be49" stroke-width="2.5"/></svg>`;
      default:
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="#f2be49"><polygon points="12,3 21,8 21,16 12,21 3,16 3,8"/></svg>`;
    }
  }

  public render(
    selectedIds: readonly EntityId[],
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    playerState?: FactionState,
  ): void {
    if (selectedIds.length === 0 || !this.popupOpen) {
      this.container.style.display = 'none';
      this.lastStructureKey = '';
      return;
    }
    this.container.style.display = 'flex';

    if (selectedIds.length === 1) {
      const bld = buildings.get(selectedIds[0]!);
      if (bld) {
        this.renderSingleBuilding(bld, playerState);
        return;
      }
      const unit = units.get(selectedIds[0]!);
      if (unit) {
        this.renderSingleUnit(unit, playerState);
        return;
      }
    }

    this.renderMultiSelection(selectedIds, units, buildings);
  }

  private renderSingleBuilding(
    bld: BuildingEntity,
    playerState?: FactionState,
  ): void {
    const def = BUILDINGS[bld.buildingType];
    const hpPct = Math.round((bld.hp / Math.max(1, bld.maxHp)) * 100);
    const isMoving = bld.mode === 'move';
    const queueSig = bld.queue.map((q) => q.itemType).join(',');
    const techSig = playerState?.researchedTechs.join(',') ?? '';

    const structKey = `bld:${bld.id}:lv${bld.level}:m${bld.mode}:c${bld.isConstructed}:r${bld.repeatQueue}:q[${queueSig}]:t[${techSig}]:est[${this.travelEstimateText ?? ''}]`;

    if (this.lastStructureKey === structKey) {
      const hpBar = this.container.querySelector(
        '#sel-live-hp-bar',
      ) as HTMLElement | null;
      if (hpBar) hpBar.style.width = `${hpPct}%`;

      const hpText = this.container.querySelector(
        '#sel-live-hp-text',
      ) as HTMLElement | null;
      if (hpText) hpText.textContent = `${Math.ceil(bld.hp)}/${bld.maxHp}`;

      if (bld.queue.length > 0) {
        const head = bld.queue[0]!;
        const qPct = Math.min(
          100,
          Math.round((head.progress / Math.max(1, head.totalTime)) * 100),
        );
        const qBar = this.container.querySelector(
          '#sel-live-q-bar',
        ) as HTMLElement | null;
        if (qBar) qBar.style.width = `${qPct}%`;
        const qText = this.container.querySelector(
          '#sel-live-q-pct',
        ) as HTMLElement | null;
        if (qText) qText.textContent = `${qPct}%`;
      }
      return;
    }

    this.lastStructureKey = structKey;

    const modeLabel = isMoving ? '⚓ Plant Legs [M]' : '🚶 Walk Mode [M]';
    const baseTier =
      bld.buildingType === 'base'
        ? (BASE_TIER_STATS[bld.level - 1] ?? BASE_TIER_STATS[0]!)
        : null;

    const travelHtml =
      this.travelEstimateText && isMoving
        ? `<div style="font-size:0.76rem;color:var(--accent-gold);font-weight:800;">🧭 ${this.travelEstimateText}</div>`
        : '';

    let queueHtml = '';
    if (bld.queue.length > 0) {
      const head = bld.queue[0]!;
      const qPct = Math.min(
        100,
        Math.round((head.progress / Math.max(1, head.totalTime)) * 100),
      );
      const qPills = bld.queue
        .map(
          (q, idx) =>
            `<span style="padding:2px 6px;border-radius:6px;background:${idx === 0 ? 'var(--accent-primary)' : 'rgba(0,0,0,0.22)'};color:${idx === 0 ? '#1d1209' : 'var(--text-dark)'};font-weight:900;font-size:0.7rem;">${idx + 1}. ${q.itemType.replace('_', ' ')}</span>`,
        )
        .join('');
      queueHtml = `
        <div class="parchment-card" style="padding:5px 8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
            <div style="display:flex;gap:4px;flex-wrap:wrap;">${qPills}</div>
            <strong id="sel-live-q-pct" style="font-size:0.74rem;">${qPct}%</strong>
          </div>
          <div style="width:100%;height:5px;background:rgba(0,0,0,0.18);border-radius:3px;margin-top:4px;overflow:hidden;">
            <div id="sel-live-q-bar" style="width:${qPct}%;height:100%;background:var(--accent-primary);"></div>
          </div>
        </div>
      `;
    }

    const produces = def.producesUnits ?? [];
    const trainCardsHtml = produces
      .map((role) => {
        const isUnit = role in UNITS;
        const uDef = isUnit
          ? UNITS[role as UnitRole]
          : MACHINES[role as MachineRole];
        if (!uDef) return '';

        const locked =
          uDef.requiredTech !== undefined &&
          playerState !== undefined &&
          !playerState.researchedTechs.includes(uDef.requiredTech);

        const costFormatted = Object.entries(uDef.cost)
          .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}:${v}`)
          .join(' · ');

        return `
          <button
            data-train-role="${role}"
            class="sw-btn train-unit-card ${locked ? '' : 'sw-btn-primary'}"
            style="opacity:${locked ? '0.65' : '1'};"
            title="${uDef.description}"
          >
            <span class="train-unit-title">${locked ? `🔒 ${uDef.name}` : `➕ ${uDef.name}`}</span>
            <span class="train-unit-cost">${locked ? `Upgrade Building or Lab to unlock` : costFormatted}</span>
          </button>
        `;
      })
      .join('');

    const canUpgrade = bld.isConstructed && bld.level < def.maxLevel;
    let upgradeLabel = '';
    let rewardText = '';
    if (canUpgrade) {
      const nextLv = bld.level + 1;
      rewardText = getBuildingLevelRewardText(bld.buildingType, nextLv);
      if (bld.buildingType === 'base') {
        const nextTier = BASE_TIER_STATS[bld.level];
        if (nextTier) {
          const parts: string[] = [];
          if (nextTier.upgradeCost.wood > 0)
            parts.push(`W:${nextTier.upgradeCost.wood}`);
          if (nextTier.upgradeCost.stone > 0)
            parts.push(`S:${nextTier.upgradeCost.stone}`);
          if (nextTier.upgradeCost.hide > 0)
            parts.push(`H:${nextTier.upgradeCost.hide}`);
          if (nextTier.upgradeCost.bronze > 0)
            parts.push(`B:${nextTier.upgradeCost.bronze}`);
          upgradeLabel = `⬆ Upgrade Lv.${nextLv} (${parts.join(' ')})`;
        }
      } else {
        const mult = bld.level;
        const wCost = Math.round((def.cost.wood ?? 60) * 0.8 * mult);
        const sCost = Math.round((def.cost.stone ?? 50) * 0.8 * mult);
        upgradeLabel = `⬆ Upgrade Lv.${nextLv} (W:${wCost} S:${sCost})`;
      }
    }

    const canDestroy = bld.buildingType !== 'base';

    this.container.innerHTML = `
      <div class="inspector-top">
        <div class="inspector-portrait">${this.getPortraitSvg(bld.buildingType)}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <strong style="font-size:0.96rem;color:var(--accent-gold);">${def.name} · Lv.${bld.level}/${def.maxLevel}</strong>
            <button id="sel-close" class="sw-btn" style="min-height:28px;min-width:28px;padding:2px 8px;">✕</button>
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);line-height:1.25;">${def.tooltip}</div>
          <div style="width:100%;height:6px;background:rgba(0,0,0,0.45);border-radius:3px;margin-top:4px;overflow:hidden;">
            <div id="sel-live-hp-bar" style="width:${hpPct}%;height:100%;background:var(--accent-success);"></div>
          </div>
        </div>
      </div>

      <div class="stat-pill-grid">
        <div class="stat-pill"><span>❤️ HP</span><strong id="sel-live-hp-text">${Math.ceil(bld.hp)}/${bld.maxHp}</strong></div>
        <div class="stat-pill"><span>🛡 ARMOR</span><strong>${def.armor + (bld.level - 1) * 3}</strong></div>
        <div class="stat-pill"><span>${baseTier ? '⚔ ATK' : '📐 SIZE'}</span><strong>${baseTier ? baseTier.attackDamage : `${bld.footprint}×${bld.footprint}`}</strong></div>
        <div class="stat-pill"><span>⚙ MODE</span><strong style="color:${isMoving ? 'var(--accent-primary)' : 'var(--accent-success)'};">${isMoving ? 'WALKING' : 'PLANTED'}</strong></div>
      </div>

      ${travelHtml}
      ${queueHtml}
      ${
        trainCardsHtml
          ? `<div class="train-card-grid">${trainCardsHtml}</div>`
          : ''
      }
      ${
        canUpgrade && rewardText
          ? `<div style="font-size:0.73rem;color:var(--accent-gold);font-weight:800;">🎁 Lv.${bld.level + 1} Reward: ${rewardText}</div>`
          : ''
      }
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="sel-toggle-mode" class="sw-btn ${isMoving ? 'sw-btn-success' : ''}" style="min-height:36px;font-size:0.75rem;">
          ${modeLabel}
        </button>
        ${
          produces.length > 0
            ? `<button id="sel-repeat" class="sw-btn ${bld.repeatQueue ? 'sw-btn-primary' : ''}" style="min-height:36px;font-size:0.75rem;">
                🔁 Repeat: ${bld.repeatQueue ? 'ON' : 'OFF'}
              </button>`
            : ''
        }
        ${
          canUpgrade && upgradeLabel
            ? `<button id="sel-upgrade-bld" class="sw-btn sw-btn-success" style="min-height:36px;font-size:0.75rem;">
                ${upgradeLabel}
              </button>`
            : ''
        }
        <button id="sel-stop" class="sw-btn" style="min-height:36px;font-size:0.75rem;">⏹ Stop</button>
        ${
          canDestroy
            ? `<button id="sel-destroy-bld" class="sw-btn sw-btn-danger" style="min-height:36px;font-size:0.75rem;" title="Demolish Building (+50% Resource Refund)">
                🗑️ Destroy
              </button>`
            : ''
        }
      </div>
    `;

    this.container
      .querySelector('#sel-close')
      ?.addEventListener('click', () => {
        this.setPopupOpen(false);
        this.callbacks.onCollapse();
      });
    this.container
      .querySelector('#sel-toggle-mode')
      ?.addEventListener('click', () =>
        this.callbacks.onToggleStructureMode(bld.id),
      );
    this.container
      .querySelector('#sel-repeat')
      ?.addEventListener('click', () =>
        this.callbacks.onToggleRepeatQueue(bld.id),
      );
    this.container
      .querySelector('#sel-upgrade-bld')
      ?.addEventListener('click', () =>
        this.callbacks.onUpgradeBuilding(bld.id),
      );
    this.container
      .querySelector('#sel-stop')
      ?.addEventListener('click', () => this.callbacks.onStopSelected());
    this.container
      .querySelector('#sel-destroy-bld')
      ?.addEventListener('click', () =>
        this.callbacks.onDestroyBuilding(bld.id),
      );

    this.container.querySelectorAll('[data-train-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = (btn as HTMLElement).getAttribute('data-train-role')!;
        this.callbacks.onTrainItem(bld.id, role);
      });
    });
  }

  private renderSingleUnit(
    unit: UnitEntity,
    playerState?: FactionState,
  ): void {
    const hpPct = Math.round((unit.hp / Math.max(1, unit.maxHp)) * 100);
    const wTier =
      unit.kind === 'unit'
        ? (playerState?.unitWeaponTiers[unit.role as UnitRole] ?? 0)
        : 0;
    const aTier =
      unit.kind === 'unit'
        ? (playerState?.unitArmorTiers[unit.role as UnitRole] ?? 0)
        : 0;

    const structKey = `unit:${unit.id}:st${unit.stance}:v${unit.veterancyRank}:w${wTier}:a${aTier}:c${unit.activeCrawlerIds.length}`;

    if (this.lastStructureKey === structKey) {
      const hpBar = this.container.querySelector(
        '#sel-unit-hp-bar',
      ) as HTMLElement | null;
      if (hpBar) hpBar.style.width = `${hpPct}%`;

      const hpText = this.container.querySelector(
        '#sel-unit-hp-text',
      ) as HTMLElement | null;
      if (hpText) hpText.textContent = `${Math.ceil(unit.hp)}/${unit.maxHp}`;

      const statusEl = this.container.querySelector(
        '#sel-unit-status-text',
      ) as HTMLElement | null;
      if (statusEl) {
        statusEl.textContent = `Activity: ${unit.status.toUpperCase()}`;
      }

      const loadEl = this.container.querySelector(
        '#sel-unit-load-text',
      ) as HTMLElement | null;
      if (loadEl) {
        loadEl.textContent = `${Math.floor(unit.carryAmount)}${unit.carryResourceType ?? ''}`;
      }
      return;
    }

    this.lastStructureKey = structKey;

    const isMachine = unit.kind === 'machine';
    const machineDef = isMachine
      ? MACHINES[unit.role as keyof typeof MACHINES]
      : null;
    const unitDef =
      unit.kind === 'unit' ? UNITS[unit.role as keyof typeof UNITS] : null;
    const heroDef =
      unit.kind === 'hero'
        ? HEROES[playerState?.tribe ?? 'stonebacks']
        : null;

    const name =
      machineDef?.name ??
      unitDef?.name ??
      heroDef?.name ??
      unit.role.toUpperCase();

    const counters = machineDef
      ? `Strong vs: ${machineDef.strongVs} · Weak vs: ${machineDef.weakVs}`
      : unitDef
        ? `Strong vs: ${unitDef.strongVs} · Weak vs: ${unitDef.weakVs}`
        : `${heroDef?.title ?? 'Chieftain Hero'} — Revives at Spirit Totem`;

    const atkVal = unitDef
      ? Math.round(unitDef.baseDamage * WEAPON_TIERS[wTier].damageMultiplier)
      : (machineDef?.baseDamage ?? heroDef?.damage ?? 20);
    const armVal = unitDef
      ? unitDef.baseArmor + ARMOR_TIERS[aTier].armorBonus
      : (machineDef?.baseArmor ?? heroDef?.armor ?? 5);
    const rngVal =
      unitDef?.attackRange ??
      machineDef?.attackRange ??
      heroDef?.attackRange ??
      1.6;

    const fourthPill =
      machineDef && machineDef.spawnsCrawler
        ? `<div class="stat-pill"><span>🕷 CRAWLERS</span><strong>${unit.activeCrawlerIds.length}/8</strong></div>`
        : unit.role === 'worker'
          ? `<div class="stat-pill"><span>🎒 LOAD</span><strong id="sel-unit-load-text">${Math.floor(unit.carryAmount)}${unit.carryResourceType ?? ''}</strong></div>`
          : `<div class="stat-pill"><span>🎯 RANGE</span><strong>${rngVal.toFixed(1)}</strong></div>`;

    this.container.innerHTML = `
      <div class="inspector-top">
        <div class="inspector-portrait">${this.getPortraitSvg(unit.role)}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <strong style="font-size:0.96rem;color:var(--accent-gold);">
              ${name}${'★'.repeat(unit.veterancyRank)}
            </strong>
            <button id="sel-close" class="sw-btn" style="min-height:28px;min-width:28px;padding:2px 8px;">✕</button>
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);line-height:1.25;">${counters}</div>
          <div style="width:100%;height:6px;background:rgba(0,0,0,0.45);border-radius:3px;margin-top:4px;overflow:hidden;">
            <div id="sel-unit-hp-bar" style="width:${hpPct}%;height:100%;background:var(--accent-success);"></div>
          </div>
        </div>
      </div>

      <div class="stat-pill-grid">
        <div class="stat-pill"><span>❤️ HP</span><strong id="sel-unit-hp-text">${Math.ceil(unit.hp)}/${unit.maxHp}</strong></div>
        <div class="stat-pill"><span>⚔ ATK (T${wTier})</span><strong>${atkVal}</strong></div>
        <div class="stat-pill"><span>🛡 ARM (T${aTier})</span><strong>${armVal}</strong></div>${fourthPill}
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button id="sel-stance" class="sw-btn" style="min-height:36px;font-size:0.75rem;">
            ${unit.stance === 'aggressive' ? '⚔ Stance: Aggressive' : '🛡 Stance: Hold Position'}
          </button>
          <button id="sel-stop" class="sw-btn sw-btn-danger" style="min-height:36px;font-size:0.75rem;">⏹ Stop</button>
        </div>
        <span id="sel-unit-status-text" style="font-size:0.72rem;font-weight:800;color:var(--text-muted);">
          Activity: ${unit.status.toUpperCase()}
        </span>
      </div>
    `;

    this.container
      .querySelector('#sel-close')
      ?.addEventListener('click', () => {
        this.setPopupOpen(false);
        this.callbacks.onCollapse();
      });
    this.container
      .querySelector('#sel-stance')
      ?.addEventListener('click', () => this.callbacks.onToggleUnitStance());
    this.container
      .querySelector('#sel-stop')
      ?.addEventListener('click', () => this.callbacks.onStopSelected());
  }

  private renderMultiSelection(
    selectedIds: readonly EntityId[],
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
  ): void {
    const structKey = `multi:${selectedIds.join(',')}`;
    if (this.lastStructureKey === structKey) {
      return;
    }
    this.lastStructureKey = structKey;

    const counts = new Map<string, number>();
    let buildingCount = 0;
    let unitCount = 0;

    for (const id of selectedIds) {
      const u = units.get(id);
      if (u) {
        unitCount++;
        counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
      }
      const b = buildings.get(id);
      if (b) {
        buildingCount++;
        counts.set(b.buildingType, (counts.get(b.buildingType) ?? 0) + 1);
      }
    }

    const badges = Array.from(counts.entries())
      .map(
        ([role, cnt]) =>
          `<span class="parchment-card" style="padding:3px 9px;font-weight:900;font-size:0.74rem;">${role.replace('_', ' ').toUpperCase()} ×${cnt}</span>`,
      )
      .join('');

    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <strong style="color:var(--accent-gold);font-size:0.95rem;">⚔ Battlegroup Selected (${selectedIds.length})</strong>
        <button id="sel-close" class="sw-btn" style="min-height:28px;min-width:28px;padding:2px 8px;">✕</button>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">${badges}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${
          buildingCount > 0
            ? `<button id="sel-relocate" class="sw-btn sw-btn-primary" style="min-height:36px;font-size:0.75rem;">🚶 Relocate Camp (${buildingCount})</button>`
            : ''
        }
        ${
          unitCount > 0
            ? `<button id="sel-stance" class="sw-btn" style="min-height:36px;font-size:0.75rem;">⚔ Toggle Stance</button>`
            : ''
        }
        <button id="sel-stop" class="sw-btn sw-btn-danger" style="min-height:36px;font-size:0.75rem;">⏹ Stop All</button>
      </div>
    `;

    this.container
      .querySelector('#sel-close')
      ?.addEventListener('click', () => {
        this.setPopupOpen(false);
        this.callbacks.onCollapse();
      });
    this.container
      .querySelector('#sel-relocate')
      ?.addEventListener('click', () =>
        this.callbacks.onRelocateSelectedBuildings(),
      );
    this.container
      .querySelector('#sel-stance')
      ?.addEventListener('click', () => this.callbacks.onToggleUnitStance());
    this.container
      .querySelector('#sel-stop')
      ?.addEventListener('click', () => this.callbacks.onStopSelected());
  }
}