/**
 * STONEWALKER — Research Hall ("The Lab") & Age Tech Tree Panel
 * Provides TWO major progression tabs:
 * 1. ⚗️ LAB UPGRADES: Directly upgrade Workers (speed, load & HP), Infantry Troops,
 *    Ranged Troops, War Machines, and your Chieftain Hero!
 * 2. 📜 AGE TECH TREE: Research the 20 Stone, Bone, and Bronze Age technologies.
 */

import { TECH_LIST } from '../data/techs';
import type {
  BuildingEntity,
  FactionState,
  Resources,
  TechBranch,
} from '../data/types';
import { ConstructionSystem } from '../systems/Construction';
import { TechSystem } from '../systems/Tech';

export type LabUpgradeCategory =
  | 'workers'
  | 'infantry'
  | 'ranged'
  | 'machines'
  | 'hero';

export interface LabUpgradeLevels {
  workers: number;
  infantry: number;
  ranged: number;
  machines: number;
  hero: number;
}

export interface TechPanelCallbacks {
  onStartResearch: (techId: string) => void;
  onUpgradeLabCategory: (category: LabUpgradeCategory) => void;
}

interface LabCategoryMeta {
  id: LabUpgradeCategory;
  name: string;
  icon: string;
  description: string;
  baseCost: Partial<Resources>;
}

const LAB_CATEGORIES: readonly LabCategoryMeta[] = [
  {
    id: 'workers',
    name: 'Tribe Workers',
    icon: '⛏️',
    description: '+25% Max HP, +15% Move Speed & +20% Harvest Rate per level.',
    baseCost: { food: 80, wood: 60 },
  },
  {
    id: 'infantry',
    name: 'Melee Infantry (Clubber, Spearman, Shield)',
    icon: '⚔️',
    description: '+25% Max HP, +20% Melee Attack Damage & +1 Weapon/Armor Tier.',
    baseCost: { food: 110, wood: 80, stone: 60 },
  },
  {
    id: 'ranged',
    name: 'Ranged & Mystics (Slinger, Bow, Shaman)',
    icon: '🏹',
    description: '+25% Max HP, +20% Ranged Damage/Healing & +1 Weapon Tier.',
    baseCost: { food: 110, wood: 90, hide: 50 },
  },
  {
    id: 'machines',
    name: 'War Machines & Walkers',
    icon: '⚙️',
    description: '+30% Machine Hull HP, +20% Siege/Fire Damage & Unlocks Next Machine.',
    baseCost: { wood: 150, stone: 130, hide: 60 },
  },
  {
    id: 'hero',
    name: 'Chieftain Hero & Spirit Totem',
    icon: '👑',
    description: '+220 Hero HP, +15 Hero Attack Damage & Unlocks Next Spirit Power.',
    baseCost: { food: 140, stone: 120, hide: 70 },
  },
];

export class TechPanel {
  public readonly container: HTMLElement;
  private readonly callbacks: TechPanelCallbacks;
  private isOpen = false;
  private activeMode: 'lab' | 'tech' = 'lab';
  private selectedBranch: TechBranch = 'gathering';

  public constructor(parent: HTMLElement, callbacks: TechPanelCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('section');
    this.container.className = 'stone-panel';
    this.container.style.cssText = `
      position: fixed;
      bottom: calc(var(--safe-bottom) + 12px);
      left: 50%;
      transform: translateX(-50%);
      width: min(860px, 95vw);
      max-height: 68dvh;
      padding: 14px;
      display: none;
      flex-direction: column;
      gap: 10px;
      z-index: 28;
      overflow-y: auto;
    `;
    parent.appendChild(this.container);
  }

  public static getLabUpgradeCost(
    category: LabUpgradeCategory,
    currentLevel: number,
  ): Partial<Resources> {
    const meta = LAB_CATEGORIES.find((c) => c.id === category)!;
    const mult = currentLevel;
    const result: Partial<Resources> = {};
    for (const [k, v] of Object.entries(meta.baseCost)) {
      result[k as keyof Resources] = Math.round((v ?? 0) * mult);
    }
    return result;
  }

  public toggle(
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
    labLevels?: LabUpgradeLevels,
  ): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.render(factionState, buildings, labLevels);
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
    buildings: Iterable<BuildingEntity>,
    labLevels: LabUpgradeLevels = {
      workers: 1,
      infantry: 1,
      ranged: 1,
      machines: 1,
      hero: 1,
    },
  ): void {
    const bldList = Array.from(buildings);

    const modeTabs = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border-stone);padding-bottom:8px;">
        <button id="tab-mode-lab" class="sw-btn ${this.activeMode === 'lab' ? 'sw-btn-primary' : ''}">
          ⚗️ Lab Unit & Machine Upgrades
        </button>
        <button id="tab-mode-tech" class="sw-btn ${this.activeMode === 'tech' ? 'sw-btn-primary' : ''}">
          📜 Age Tech Tree (20 Techs)
        </button>
      </div>
    `;

    let bodyHtml = '';

    if (this.activeMode === 'lab') {
      const labCards = LAB_CATEGORIES.map((cat) => {
        const curLv = labLevels[cat.id];
        const maxLv = 5;
        const isMax = curLv >= maxLv;
        const cost = TechPanel.getLabUpgradeCost(cat.id, curLv);
        const canAfford = ConstructionSystem.canAfford(
          factionState.resources,
          cost,
        );
        const costStr = Object.entries(cost)
          .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
          .join(' · ');

        return `
          <div class="parchment-card" style="padding:10px 12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div style="flex:1;min-width:210px;">
              <strong style="font-size:0.95rem;">${cat.icon} ${cat.name} (Lv.${curLv}/${maxLv})</strong>
              <div style="font-size:0.76rem;margin-top:2px;">${cat.description}</div>
              ${
                !isMax
                  ? `<div style="font-size:0.74rem;font-weight:900;margin-top:3px;color:${canAfford ? '#251d17' : 'var(--accent-danger)'};">Upgrade Cost: ${costStr}</div>`
                  : ''
              }
            </div>
            <div>
              ${
                isMax
                  ? `<span style="color:var(--accent-success);font-weight:900;">★ MAX LEVEL</span>`
                  : `<button data-lab-up="${cat.id}" class="sw-btn ${canAfford ? 'sw-btn-primary' : ''}" style="min-height:38px;">
                      ⬆ Upgrade to Lv.${curLv + 1}
                    </button>`
              }
            </div>
          </div>
        `;
      }).join('');

      bodyHtml = `<div style="display:flex;flex-direction:column;gap:8px;">${labCards}</div>`;
    } else {
      const branches: TechBranch[] = [
        'gathering',
        'building',
        'military',
        'machines',
      ];
      const branchTabs = branches
        .map(
          (b) => `
          <button data-branch-tab="${b}" class="sw-btn ${this.selectedBranch === b ? 'sw-btn-primary' : ''}" style="min-height:36px;text-transform:capitalize;">
            ${b}
          </button>
        `,
        )
        .join('');

      const activeHtml = factionState.activeResearch
        ? `<div class="parchment-card" style="padding:8px 12px;font-weight:800;">
             Researching: ${factionState.activeResearch.itemType.replace('_', ' ')} (${Math.round((factionState.activeResearch.progress / Math.max(1, factionState.activeResearch.totalTime)) * 100)}%)
           </div>`
        : '';

      const branchTechs = TECH_LIST.filter(
        (t) => t.branch === this.selectedBranch,
      );

      const techCards = branchTechs
        .map((t) => {
          const done = factionState.researchedTechs.includes(t.id);
          const check = TechSystem.canResearch(t.id, factionState, bldList);
          const costStr = Object.entries(t.cost)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ');

          return `
            <div class="parchment-card" style="padding:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div>
                <strong style="font-size:0.95rem;">[${t.age.toUpperCase()} AGE] ${t.name}</strong>
                <div style="font-size:0.78rem;">${t.description}</div>
                <div style="font-size:0.75rem;font-weight:800;margin-top:2px;">Cost: ${costStr} · ${t.researchTime}s</div>
              </div>
              <div>
                ${
                  done
                    ? `<span style="color:var(--accent-success);font-weight:900;">✓ Researched</span>`
                    : `<button data-research-id="${t.id}" class="sw-btn ${check.ok ? 'sw-btn-primary' : ''}" style="min-height:38px;" ${check.ok ? '' : 'disabled'}>
                        ${check.ok ? 'Research' : (check.reason ?? 'Locked')}
                      </button>`
                }
              </div>
            </div>
          `;
        })
        .join('');

      bodyHtml = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">${branchTabs}</div>
        ${activeHtml}
        <div style="display:flex;flex-direction:column;gap:8px;">${techCards}</div>
      `;
    }

    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <strong style="font-size:1.1rem;color:var(--accent-gold);">⚗️ Research Lab & Tribal Tech Hall</strong>
        <button id="tech-close" class="sw-btn" style="min-height:34px;padding:4px 12px;">✕ Close</button>
      </div>
      ${modeTabs}
      ${bodyHtml}
    `;

    this.container
      .querySelector('#tech-close')
      ?.addEventListener('click', () => this.close());

    this.container
      .querySelector('#tab-mode-lab')
      ?.addEventListener('click', () => {
        this.activeMode = 'lab';
        this.render(factionState, bldList, labLevels);
      });

    this.container
      .querySelector('#tab-mode-tech')
      ?.addEventListener('click', () => {
        this.activeMode = 'tech';
        this.render(factionState, bldList, labLevels);
      });

    this.container.querySelectorAll('[data-lab-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = (btn as HTMLElement).getAttribute(
          'data-lab-up',
        ) as LabUpgradeCategory;
        this.callbacks.onUpgradeLabCategory(cat);
      });
    });

    this.container.querySelectorAll('[data-branch-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedBranch = (btn as HTMLElement).getAttribute(
          'data-branch-tab',
        ) as TechBranch;
        this.render(factionState, bldList, labLevels);
      });
    });

    this.container.querySelectorAll('[data-research-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-research-id')!;
        this.callbacks.onStartResearch(id);
        this.render(factionState, bldList, labLevels);
      });
    });
  }
}