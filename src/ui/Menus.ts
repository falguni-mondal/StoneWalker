/**
 * STONEWALKER — Welcome Screen, Non-Overflowing Skirmish Builder, Saved Games, Settings & Credits
 * - Hides the underlying Welcome Card whenever a modal opens so cards never stack on each other.
 * - Uses tactile segmented pill buttons in Custom Skirmish instead of overflowing native <select> boxes.
 */

import type { SavedBattleSnapshot } from '../core/SaveSystem';
import type { SettingsManager } from '../core/Settings';
import { TRIBE_LIST } from '../data/heroes';
import {
  createSkirmishLevelDefinition,
  SKIRMISH_MAP_SIZES,
} from '../data/levels';
import type {
  GraphicsQuality,
  LevelDefinition,
  MapTheme,
  TribeId,
} from '../data/types';

export interface MenusCallbacks {
  onOpenCampaign: () => void;
  onStartSkirmish: (level: LevelDefinition, tribe: TribeId) => void;
  onResumeCurrentBattle: () => void;
  onLoadSavedBattle: (slot?: 'manual' | 'auto') => void;
  onSaveManualSlot: () => void;
  onGetSavedSnapshots?: () => {
    manual: SavedBattleSnapshot | null;
    auto: SavedBattleSnapshot | null;
  };
  onVisibilityChange?: (welcomeVisible: boolean) => void;
}

export class MenusManager {
  private readonly mainMenuEl: HTMLElement;
  private readonly modalEl: HTMLElement;
  private readonly settings: SettingsManager;
  private readonly callbacks: MenusCallbacks;

  // Skirmish Builder State (Tactile Segmented Pills — 0% Dropdown Overflow)
  private skirmishSize: number = 128;
  private skirmishEnemies: 1 | 2 | 3 = 2;
  private skirmishDifficulty: 'easy' | 'normal' | 'hard' = 'normal';
  private skirmishTribe: TribeId = 'stonebacks';
  private skirmishSeed: number = Math.floor(10000 + Math.random() * 89999);

  public constructor(
    parent: HTMLElement,
    settings: SettingsManager,
    callbacks: MenusCallbacks,
  ) {
    this.settings = settings;
    this.callbacks = callbacks;

    this.mainMenuEl = document.createElement('section');
    this.mainMenuEl.className = 'welcome-screen-backdrop';
    this.mainMenuEl.style.display = 'none';

    this.modalEl = document.createElement('section');
    this.modalEl.className = 'stone-panel';
    this.modalEl.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(520px, 94vw);
      max-height: 88dvh;
      padding: 18px;
      display: none;
      flex-direction: column;
      gap: 12px;
      z-index: 45;
      overflow-y: auto;
      overflow-x: hidden;
      border-color: var(--border-gold);
    `;

    parent.appendChild(this.mainMenuEl);
    parent.appendChild(this.modalEl);
  }

  public isMainMenuVisible(): boolean {
    return (
      this.mainMenuEl.style.display === 'flex' ||
      this.modalEl.style.display === 'flex'
    );
  }

  private openSubModal(): void {
    // Hide the Welcome Card behind the modal so they never visually collide
    const welcomeCard = this.mainMenuEl.querySelector(
      '.welcome-card',
    ) as HTMLElement | null;
    if (welcomeCard) {
      welcomeCard.style.visibility = 'hidden';
    }
    this.modalEl.style.display = 'flex';
  }

  private closeSubModal(): void {
    this.modalEl.style.display = 'none';
    const welcomeCard = this.mainMenuEl.querySelector(
      '.welcome-card',
    ) as HTMLElement | null;
    if (welcomeCard) {
      welcomeCard.style.visibility = 'visible';
    }
  }

  public showMainMenu(_hasSavedSnapshot: boolean): void {
    this.modalEl.style.display = 'none';
    this.mainMenuEl.style.display = 'flex';
    this.callbacks.onVisibilityChange?.(true);

    this.mainMenuEl.innerHTML = `
      <div class="stone-panel welcome-card">
        <div class="byfalguni-badge">BYFALGUNI ORIGINAL</div>
        <h1 class="welcome-title">STONEWALKER</h1>
        <p class="welcome-subtitle">
          Awaken the giant Council Walker, build a living prehistoric camp that marches beside you, and lead your tribe to sovereignty.
        </p>

        <div class="welcome-menu-buttons">
          <button id="mm-play" class="sw-btn sw-btn-primary welcome-btn-main">
            ▶ Play Game
          </button>
          <button id="mm-campaign" class="sw-btn welcome-btn">
            🗺️ Campaign Map (8 Levels)
          </button>
          <button id="mm-skirmish" class="sw-btn welcome-btn">
            ⚔️ Skirmish Battle
          </button>
          <button id="mm-saved-games" class="sw-btn welcome-btn">
            💾 Saved Games
          </button>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;">
            <button id="mm-settings" class="sw-btn welcome-btn">
              ⚙️ Settings
            </button>
            <button id="mm-howto" class="sw-btn welcome-btn">
              📖 How to Play
            </button>
          </div>
          <button id="mm-credits" class="sw-btn welcome-btn" style="border-color:var(--border-gold);color:var(--accent-gold);">
            ✨ Credits & About ByFalguni
          </button>
        </div>

        <footer class="welcome-footer">
          <div>Crafted by <strong>Falguni Mondal</strong> · <strong>ByFalguni</strong></div>
          <div style="font-size:0.7rem;opacity:0.82;">© 2026 ByFalguni. All Rights Reserved.</div>
        </footer>
      </div>
    `;

    this.mainMenuEl.querySelector('#mm-play')?.addEventListener('click', () => {
      this.hideAll();
      this.callbacks.onResumeCurrentBattle();
    });

    this.mainMenuEl
      .querySelector('#mm-campaign')
      ?.addEventListener('click', () => {
        this.mainMenuEl.style.display = 'none';
        this.callbacks.onOpenCampaign();
      });

    this.mainMenuEl
      .querySelector('#mm-skirmish')
      ?.addEventListener('click', () => {
        this.showSkirmishModal();
      });

    this.mainMenuEl
      .querySelector('#mm-saved-games')
      ?.addEventListener('click', () => {
        this.showSavedGamesModal();
      });

    this.mainMenuEl
      .querySelector('#mm-settings')
      ?.addEventListener('click', () => {
        this.showSettingsModal();
      });

    this.mainMenuEl
      .querySelector('#mm-howto')
      ?.addEventListener('click', () => {
        this.showHowToPlayModal();
      });

    this.mainMenuEl
      .querySelector('#mm-credits')
      ?.addEventListener('click', () => {
        this.showCreditsModal();
      });
  }

  public hideAll(): void {
    this.mainMenuEl.style.display = 'none';
    this.modalEl.style.display = 'none';
    this.callbacks.onVisibilityChange?.(false);
  }

  public showSkirmishModal(): void {
    this.openSubModal();

    const sizeButtons = SKIRMISH_MAP_SIZES.map(
      (s) => `
        <button data-sk-size="${s}" class="segmented-pill ${this.skirmishSize === s ? 'active' : ''}">
          ${s}×${s}
        </button>
      `,
    ).join('');

    const enemyButtons = ([1, 2, 3] as const)
      .map(
        (cnt) => `
        <button data-sk-enemies="${cnt}" class="segmented-pill ${this.skirmishEnemies === cnt ? 'active' : ''}">
          ${cnt} AI ${cnt === 1 ? 'Tribe' : 'Tribes'}
        </button>
      `,
      )
      .join('');

    const diffButtons = (['easy', 'normal', 'hard'] as const)
      .map(
        (d) => `
        <button data-sk-diff="${d}" class="segmented-pill ${this.skirmishDifficulty === d ? 'active' : ''}">
          ${d.toUpperCase()}
        </button>
      `,
      )
      .join('');

    const tribeButtons = TRIBE_LIST.map(
      (t) => `
        <button
          data-sk-tribe="${t.id}"
          class="segmented-pill ${this.skirmishTribe === t.id ? 'active' : ''}"
          style="text-align:left;padding:8px 10px;display:flex;flex-direction:column;gap:2px;"
        >
          <span style="font-size:0.82rem;font-weight:900;">${this.skirmishTribe === t.id ? '✓ ' : ''}${t.name}</span>
          <span style="font-size:0.7rem;font-weight:700;opacity:0.88;line-height:1.25;">${t.description}</span>
        </button>
      `,
    ).join('');

    this.modalEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:1.15rem;color:var(--accent-gold);">⚔️ Custom Skirmish Battle</strong>
        <button id="sk-close" class="sw-btn" style="min-height:34px;">✕</button>
      </div>

      <div class="parchment-card" style="padding:12px;display:flex;flex-direction:column;gap:10px;">
        <div>
          <div style="font-size:0.76rem;font-weight:900;margin-bottom:4px;">1. Map Size:</div>
          <div class="segmented-group">${sizeButtons}</div>
        </div>

        <div>
          <div style="font-size:0.76rem;font-weight:900;margin-bottom:4px;">2. Rival AI Tribes:</div>
          <div class="segmented-group">${enemyButtons}</div>
        </div>

        <div>
          <div style="font-size:0.76rem;font-weight:900;margin-bottom:4px;">3. AI Difficulty:</div>
          <div class="segmented-group">${diffButtons}</div>
        </div>

        <div>
          <div style="font-size:0.76rem;font-weight:900;margin-bottom:4px;">4. Choose Your Tribe:</div>
          <div style="display:flex;flex-direction:column;gap:6px;">${tribeButtons}</div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;border-top:1px solid rgba(0,0,0,0.12);padding-top:8px;">
          <strong style="font-size:0.78rem;">Map Seed:</strong>
          <div style="display:flex;align-items:center;gap:6px;flex:1;justify-content:flex-end;">
            <input id="sk-seed" class="sw-input" type="number" value="${this.skirmishSeed}" style="width:110px;" />
            <button id="sk-random-seed" class="sw-btn" style="min-height:34px;padding:4px 8px;" title="Roll Random Seed">🎲</button>
            <button id="sk-copy-seed" class="sw-btn" style="min-height:34px;padding:4px 10px;">Copy</button>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="sk-back" class="sw-btn">Back</button>
        <button id="sk-launch" class="sw-btn sw-btn-primary" style="flex:1;">▶ Launch Skirmish</button>
      </div>
    `;

    this.modalEl.querySelector('#sk-close')?.addEventListener('click', () => {
      this.closeSubModal();
    });
    this.modalEl.querySelector('#sk-back')?.addEventListener('click', () => {
      this.closeSubModal();
    });

    this.modalEl.querySelectorAll('[data-sk-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.skirmishSize = Number(
          (btn as HTMLElement).getAttribute('data-sk-size'),
        );
        this.showSkirmishModal();
      });
    });

    this.modalEl.querySelectorAll('[data-sk-enemies]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.skirmishEnemies = Number(
          (btn as HTMLElement).getAttribute('data-sk-enemies'),
        ) as 1 | 2 | 3;
        this.showSkirmishModal();
      });
    });

    this.modalEl.querySelectorAll('[data-sk-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.skirmishDifficulty = (btn as HTMLElement).getAttribute(
          'data-sk-diff',
        ) as 'easy' | 'normal' | 'hard';
        this.showSkirmishModal();
      });
    });

    this.modalEl.querySelectorAll('[data-sk-tribe]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.skirmishTribe = (btn as HTMLElement).getAttribute(
          'data-sk-tribe',
        ) as TribeId;
        this.showSkirmishModal();
      });
    });

    this.modalEl
      .querySelector('#sk-seed')
      ?.addEventListener('input', (e) => {
        this.skirmishSeed =
          Number((e.currentTarget as HTMLInputElement).value) || 12345;
      });

    this.modalEl
      .querySelector('#sk-random-seed')
      ?.addEventListener('click', () => {
        this.skirmishSeed = Math.floor(10000 + Math.random() * 89999);
        this.showSkirmishModal();
      });

    this.modalEl
      .querySelector('#sk-copy-seed')
      ?.addEventListener('click', () => {
        navigator.clipboard
          ?.writeText(String(this.skirmishSeed))
          .catch(() => {});
      });

    this.modalEl.querySelector('#sk-launch')?.addEventListener('click', () => {
      const themes: MapTheme[] = [
        'green_valley',
        'ancient_forest',
        'river_crossings',
        'arid_desert',
        'frost_peaks',
        'titan_plateau',
      ];
      const theme = themes[Math.abs(this.skirmishSeed) % themes.length]!;
      const lvl = createSkirmishLevelDefinition({
        size: this.skirmishSize,
        seed: this.skirmishSeed,
        theme,
        weather: 'clear',
        playerTribe: this.skirmishTribe,
        enemyCount: this.skirmishEnemies,
        difficulty: this.skirmishDifficulty,
      });
      this.hideAll();
      this.callbacks.onStartSkirmish(lvl, this.skirmishTribe);
    });
  }

  public showSavedGamesModal(): void {
    this.openSubModal();
    const slots = this.callbacks.onGetSavedSnapshots?.() ?? {
      manual: null,
      auto: null,
    };

    const formatSlot = (
      title: string,
      snap: SavedBattleSnapshot | null,
      slotKey: 'manual' | 'auto',
    ): string => {
      if (!snap) {
        return `
          <div class="parchment-card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;opacity:0.7;">
            <div>
              <strong>${title}</strong>
              <div style="font-size:0.76rem;">Empty Slot — Use 💾 Save in-game to record progress.</div>
            </div>
            <span style="font-size:0.76rem;font-weight:800;">Empty</span>
          </div>
        `;
      }
      const dateStr = new Date(snap.timestamp).toLocaleString();
      const lvlLabel =
        snap.levelId > 0 ? `Campaign Level ${snap.levelId}` : 'Custom Skirmish';
      return `
        <div class="parchment-card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <strong style="font-size:0.92rem;">${title} — ${lvlLabel}</strong>
            <div style="font-size:0.74rem;">Saved: ${dateStr} · Seed: ${snap.seed}</div>
          </div>
          <button data-load-slot="${slotKey}" class="sw-btn sw-btn-success" style="min-height:38px;">
            📂 Load Game
          </button>
        </div>
      `;
    };

    this.modalEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:1.15rem;color:var(--accent-gold);">💾 Saved Games & Progress</strong>
        <button id="sg-close" class="sw-btn" style="min-height:34px;">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${formatSlot('Manual Save Slot', slots.manual, 'manual')}
        ${formatSlot('Automatic Save Slot (60s)', slots.auto, 'auto')}
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:4px;flex-wrap:wrap;">
        <button id="sg-save-now" class="sw-btn sw-btn-primary">💾 Save Current Battle Now</button>
        <button id="sg-back" class="sw-btn">Back</button>
      </div>
    `;

    this.modalEl.querySelector('#sg-close')?.addEventListener('click', () => {
      this.closeSubModal();
    });
    this.modalEl.querySelector('#sg-back')?.addEventListener('click', () => {
      this.closeSubModal();
    });
    this.modalEl
      .querySelector('#sg-save-now')
      ?.addEventListener('click', () => {
        this.callbacks.onSaveManualSlot();
        this.showSavedGamesModal();
      });

    this.modalEl.querySelectorAll('[data-load-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = (btn as HTMLElement).getAttribute('data-load-slot') as
          | 'manual'
          | 'auto';
        this.hideAll();
        this.callbacks.onLoadSavedBattle(slot);
      });
    });
  }

  public showCreditsModal(): void {
    this.openSubModal();
    this.modalEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:1.15rem;color:var(--accent-gold);">✨ STONEWALKER — Credits</strong>
        <button id="cr-close" class="sw-btn" style="min-height:34px;">✕</button>
      </div>

      <div class="parchment-card" style="padding:15px;display:flex;flex-direction:column;gap:11px;line-height:1.48;font-size:0.84rem;">
        <div style="text-align:center;border-bottom:1px solid var(--border-parchment);padding-bottom:10px;">
          <div style="font-size:0.72rem;font-weight:900;letter-spacing:0.14em;color:#8a3a05;">A BYFALGUNI PRODUCTION</div>
          <h3 style="margin:4px 0 2px 0;font-size:1.25rem;color:#251d17;">Created & Developed by Falguni Mondal</h3>
          <div style="font-size:0.78rem;font-weight:800;color:#5c4938;">Brand & Creative Studio: ByFalguni (BYFALGUNI)</div>
        </div>

        <p style="margin:0;">
          <strong>STONEWALKER</strong> was conceived, designed, engineered, and sculpted entirely in code by <strong>Falguni Mondal</strong> under the <strong>ByFalguni</strong> creative banner. Every walking fortress leg, low-poly prehistoric monument, autonomous tribe AI, and synthesized war-drum beat was crafted from the ground up using Three.js, TypeScript, and WebAudio to bring a tactile, classic real-time strategy experience to both mobile touchscreens and desktop command centers.
        </p>

        <p style="margin:0;">
          Inspired by timeless strategy legends like <em>Command & Conquer</em>, <em>Prehistoric Tribes</em>, and <em>Clash of Clans</em>, Stonewalker reimagines the RTS base not as a static anchor, but as a living, striding colossus. Whether you are marching your Council Walker across uncharted valleys, relocating your entire camp in formation, or watching your workers rally to the Weapon Station when the war horn sounds—thank you for stepping into this world and leading your tribe.
        </p>

        <div style="background:rgba(0,0,0,0.06);padding:10px;border-radius:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;font-size:0.76rem;">
          <div><strong>Game Direction & Code:</strong><br/>Falguni Mondal</div>
          <div><strong>3D Procedural Art & UI/UX:</strong><br/>Falguni Mondal</div>
          <div><strong>WebAudio Synthesis & Systems:</strong><br/>Falguni Mondal</div>
          <div><strong>Official Brand & Portfolio:</strong><br/>ByFalguni (BYFALGUNI)</div>
        </div>

        <div style="text-align:center;font-size:0.74rem;font-weight:800;color:#5c4938;padding-top:2px;">
          © 2026 ByFalguni · Falguni Mondal. All Rights Reserved.
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;">
        <button id="cr-done" class="sw-btn sw-btn-primary">Back</button>
      </div>
    `;

    this.modalEl.querySelector('#cr-close')?.addEventListener('click', () => {
      this.closeSubModal();
    });
    this.modalEl.querySelector('#cr-done')?.addEventListener('click', () => {
      this.closeSubModal();
    });
  }

  public showSettingsModal(): void {
    this.openSubModal();
    const s = this.settings.get();
    this.modalEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:1.15rem;color:var(--accent-gold);">⚙️ Settings & Accessibility</strong>
        <button id="set-close" class="sw-btn" style="min-height:34px;">✕</button>
      </div>
      <div class="parchment-card" style="padding:12px;display:flex;flex-direction:column;gap:8px;font-size:0.84rem;">
        <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>Mute All Audio</span>
          <input id="set-mute" type="checkbox" ${s.muted ? 'checked' : ''} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>Master Volume (${Math.round(s.masterVolume * 100)}%)</span>
          <input id="set-vol" type="range" min="0" max="1" step="0.05" value="${s.masterVolume}" style="width:120px;" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>Graphics Quality</span>
          <select id="set-quality" class="sw-select">
            <option value="auto" ${s.graphicsQuality === 'auto' ? 'selected' : ''}>Auto</option>
            <option value="low" ${s.graphicsQuality === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${s.graphicsQuality === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${s.graphicsQuality === 'high' ? 'selected' : ''}>High</option>
          </select>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>Haptic Vibration</span>
          <input id="set-haptics" type="checkbox" ${s.hapticsEnabled ? 'checked' : ''} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>Floating Damage Numbers</span>
          <input id="set-dmg" type="checkbox" ${s.floatingDamageNumbers ? 'checked' : ''} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>High Contrast Theme</span>
          <input id="set-hc" type="checkbox" ${s.highContrast ? 'checked' : ''} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>Large Text Mode</span>
          <input id="set-lt" type="checkbox" ${s.largeText ? 'checked' : ''} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>Reduced Motion</span>
          <input id="set-rm" type="checkbox" ${s.reducedMotion ? 'checked' : ''} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>Colorblind-Safe Team Colors</span>
          <input id="set-cb" type="checkbox" ${s.colorblindMode ? 'checked' : ''} />
        </label>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <button id="set-save-slot" class="sw-btn">💾 Save Battle Now</button>
        <button id="set-done" class="sw-btn sw-btn-primary">Done</button>
      </div>
    `;

    this.modalEl.querySelector('#set-close')?.addEventListener('click', () => {
      this.closeSubModal();
    });
    this.modalEl.querySelector('#set-done')?.addEventListener('click', () => {
      this.closeSubModal();
    });

    this.modalEl.querySelector('#set-mute')?.addEventListener('change', (e) => {
      this.settings.update({
        muted: (e.currentTarget as HTMLInputElement).checked,
      });
    });

    this.modalEl.querySelector('#set-vol')?.addEventListener('input', (e) => {
      this.settings.update({
        masterVolume: Number((e.currentTarget as HTMLInputElement).value),
      });
    });

    this.modalEl
      .querySelector('#set-quality')
      ?.addEventListener('change', (e) => {
        this.settings.setQuality(
          (e.currentTarget as HTMLSelectElement).value as GraphicsQuality,
        );
      });

    this.modalEl
      .querySelector('#set-haptics')
      ?.addEventListener('change', (e) => {
        this.settings.update({
          hapticsEnabled: (e.currentTarget as HTMLInputElement).checked,
        });
      });

    this.modalEl.querySelector('#set-dmg')?.addEventListener('change', (e) => {
      this.settings.update({
        floatingDamageNumbers: (e.currentTarget as HTMLInputElement).checked,
      });
    });

    this.modalEl.querySelector('#set-hc')?.addEventListener('change', (e) => {
      this.settings.update({
        highContrast: (e.currentTarget as HTMLInputElement).checked,
      });
    });

    this.modalEl.querySelector('#set-lt')?.addEventListener('change', (e) => {
      this.settings.update({
        largeText: (e.currentTarget as HTMLInputElement).checked,
      });
    });

    this.modalEl.querySelector('#set-rm')?.addEventListener('change', (e) => {
      this.settings.update({
        reducedMotion: (e.currentTarget as HTMLInputElement).checked,
      });
    });

    this.modalEl.querySelector('#set-cb')?.addEventListener('change', (e) => {
      this.settings.update({
        colorblindMode: (e.currentTarget as HTMLInputElement).checked,
      });
    });

    this.modalEl
      .querySelector('#set-save-slot')
      ?.addEventListener('click', () => {
        this.callbacks.onSaveManualSlot();
        this.closeSubModal();
      });
  }

  public showHowToPlayModal(): void {
    this.openSubModal();
    this.modalEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:1.15rem;color:var(--accent-gold);">📖 How to Play STONEWALKER</strong>
        <button id="htp-close" class="sw-btn" style="min-height:34px;">✕</button>
      </div>
      <div class="parchment-card" style="padding:12px;font-size:0.83rem;display:flex;flex-direction:column;gap:8px;line-height:1.4;">
        <div><strong>1. Upgrade Your Base to Unlock Buildings:</strong> Your <em>Council Walker Base</em> starts at Lv.1 with essential camp buildings. Upgrade the Base to <strong>Lv.2</strong> to unlock the <em>Sling Range, Tannery, Beast Pen, Armory, Research Hall (Lab), and Spirit Totem</em>, and to <strong>Lv.3</strong> to unlock the <em>Machine Workshop and Bronze Smeltery</em>!</div>
        <div><strong>2. Walk & Stomp:</strong> Select your Council Walker and tap <em>Walk Mode [M]</em> to march across the map, crush forest trees into +25 Wood, and stomp small enemy units & barricades.</div>
        <div><strong>3. Relocate Your Whole Camp:</strong> Every building has legs! Tap the <em>Camp</em> icon at the bottom and use <em>Relocate Camp</em> to walk all buildings together in formation.</div>
        <div><strong>4. 5-Second Auto-Heal & Base Alarms:</strong> Any unit or building that avoids damage for 5 seconds regenerates HP automatically. When attacked, Workers grab stocked weapons from the Weapon Station to defend!</div>
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button id="htp-done" class="sw-btn sw-btn-primary">Got It</button>
      </div>
    `;
    this.modalEl.querySelector('#htp-close')?.addEventListener('click', () => {
      this.closeSubModal();
    });
    this.modalEl.querySelector('#htp-done')?.addEventListener('click', () => {
      this.closeSubModal();
    });
  }

  public showEndScreen(params: {
    won: boolean;
    stars: 0 | 1 | 2 | 3;
    levelName: string;
    elapsedSec: number;
    unitsLost: number;
    enemiesDefeated: number;
    onContinue: () => void;
  }): void {
    this.openSubModal();
    const starDisplay = params.won
      ? '★'.repeat(params.stars) + '☆'.repeat(3 - params.stars)
      : '☆☆☆';

    this.modalEl.innerHTML = `
      <div style="text-align:center;display:flex;flex-direction:column;gap:10px;">
        <h2 style="margin:0;font-size:1.8rem;color:${params.won ? 'var(--accent-gold)' : 'var(--accent-danger)'};">
          ${params.won ? 'VICTORY!' : 'DEFEAT'}
        </h2>
        <div style="font-size:2.2rem;color:var(--accent-gold);letter-spacing:0.15em;">
          ${starDisplay}
        </div>
        <div class="parchment-card" style="padding:12px;display:flex;justify-content:space-around;flex-wrap:wrap;gap:8px;font-weight:800;">
          <span>Time: ${Math.floor(params.elapsedSec / 60)}m ${Math.floor(params.elapsedSec % 60)}s</span>
          <span>Enemies Defeated: ${params.enemiesDefeated}</span>
          <span>Units Lost: ${params.unitsLost}</span>
        </div>
        <button id="end-continue" class="sw-btn sw-btn-primary" style="width:100%;">Continue to Campaign Map</button>
      </div>
    `;

    this.modalEl
      .querySelector('#end-continue')
      ?.addEventListener('click', () => {
        this.closeSubModal();
        params.onContinue();
      });
  }
}