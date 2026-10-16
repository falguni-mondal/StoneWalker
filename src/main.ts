/**
 * STONEWALKER — Complete Production Game Coordinator
 * - Connects `onRestartLevel` in HUD & Menus and `onDestroyBuilding` in SelectionBar.
 * - Smart Worker Assignment: Placing a new building prefers idle or gathering workers so
 *   active builders never abandon an unfinished building at 94%.
 * - Demolishing a building via `🗑️ Destroy` refunds 50% of its resources and frees its tiles.
 */

import * as THREE from 'three';
import { EnemyAIController } from './ai/EnemyAI';
import { SoldierAI } from './ai/SoldierAI';
import { WorkerAI } from './ai/WorkerAI';
import { AmbientAudio } from './audio/Ambient';
import { SynthSFX } from './audio/SynthSFX';
import { CONFIG } from './config';
import { DayNightCycle } from './core/DayNight';
import { EventBus } from './core/EventBus';
import { GameLoop } from './core/GameLoop';
import { Haptics } from './core/Haptics';
import { RNG } from './core/RNG';
import {
  type SavedBattleSnapshot,
  type SaveSlotIndex,
  SaveSystem,
} from './core/SaveSystem';
import { SettingsManager } from './core/Settings';
import { WeatherController } from './core/Weather';
import { BALANCE } from './data/balance';
import { BASE_TIER_STATS, BUILDINGS } from './data/buildings';
import { CAMPAIGN_LEVELS } from './data/levels';
import type {
  ArmorTier,
  BuildingEntity,
  BuildingType,
  EntityId,
  FactionId,
  FactionState,
  LevelDefinition,
  MachineRole,
  ProjectileEntity,
  ResourceType,
  TileCoord,
  TribeId,
  UnitEntity,
  UnitRole,
  Vec2,
  WeaponTier,
} from './data/types';
import { createBaseEntity, setBaseMode } from './entities/Base';
import { createBeastEntity } from './entities/Beast';
import { createBuildingEntity, setBuildingMode } from './entities/Building';
import { createHeroEntity } from './entities/Hero';
import { createMachineEntity } from './entities/Machine';
import { createSoldierEntity } from './entities/Soldier';
import { createWorkerEntity } from './entities/Worker';
import { CommandResolver } from './input/CommandResolver';
import { MouseKeyboardController } from './input/MouseKeyboardController';
import { TouchController } from './input/TouchController';
import { CameraRig } from './render/CameraRig';
import { EffectsManager } from './render/Effects';
import { ModelFactory } from './render/ModelFactory';
import { SceneSetup } from './render/SceneSetup';
import { AlarmResponseSystem } from './systems/AlarmResponse';
import { BeastTamingSystem } from './systems/BeastTaming';
import { CombatSystem } from './systems/Combat';
import { ConstructionSystem } from './systems/Construction';
import { EquipmentSystem } from './systems/Equipment';
import { GatheringSystem } from './systems/Gathering';
import { HousingSystem } from './systems/Housing';
import { IdleBehaviorSystem } from './systems/IdleBehavior';
import { MovementSystem } from './systems/Movement';
import { Pathfinder } from './systems/Pathfinding';
import { type ActivePowerZone, PowersSystem } from './systems/Powers';
import { ProductionSystem } from './systems/Production';
import { SpawnerSystem } from './systems/Spawner';
import { StompSystem } from './systems/Stomp';
import { TechSystem } from './systems/Tech';
import { VictorySystem } from './systems/Victory';
import { ArmoryPanel } from './ui/ArmoryPanel';
import { BuildSheet } from './ui/BuildSheet';
import { HUD } from './ui/HUD';
import { LevelSelectScreen } from './ui/LevelSelect';
import { MenusManager } from './ui/Menus';
import { Minimap, type MinimapBlip } from './ui/Minimap';
import { NotificationManager } from './ui/Notifications';
import { PowerBar } from './ui/PowerBar';
import {
  getBuildingLevelRewardText,
  SelectionBar,
} from './ui/SelectionBar';
import {
  type LabUpgradeCategory,
  type LabUpgradeLevels,
  TechPanel,
} from './ui/TechPanel';
import { TutorialOverlay } from './ui/Tutorial';
import { FogOfWar, type VisionEmitter } from './world/Fog';
import { type GeneratedWorld, MapGenerator } from './world/MapGenerator';
import { TerrainRenderer } from './world/TerrainMesh';

const AUTOSAVE_INTERVAL_SEC = 20;

export class StonewalkerGame {
  private readonly bus = new EventBus();
  private readonly settings = new SettingsManager(this.bus);
  private readonly haptics = new Haptics(this.settings);
  private readonly sfx = new SynthSFX(this.settings);
  private readonly ambient = new AmbientAudio(this.settings, this.sfx);
  private readonly saveSystem = new SaveSystem();
  private readonly dayNight = new DayNightCycle(this.bus);
  private readonly weather = new WeatherController(this.bus);
  private rng = new RNG(10101);

  private readonly sceneSetup: SceneSetup;
  private readonly cameraRig: CameraRig;
  private world!: GeneratedWorld;
  private fog!: FogOfWar;
  private terrainRenderer: TerrainRenderer | null = null;
  private readonly modelFactory = new ModelFactory();
  private readonly effects: EffectsManager;
  private readonly commandResolver: CommandResolver;

  private readonly units = new Map<EntityId, UnitEntity>();
  private readonly buildings = new Map<EntityId, BuildingEntity>();
  private readonly projectiles = new Map<EntityId, ProjectileEntity>();
  private readonly activePowerZones: ActivePowerZone[] = [];
  private readonly unitMeshes = new Map<EntityId, THREE.Group>();
  private readonly buildingMeshes = new Map<EntityId, THREE.Group>();
  private readonly entityGroup = new THREE.Group();

  private readonly factions = new Map<string, FactionState>();
  private readonly tribeByFaction = new Map<string, TribeId>();
  private readonly enemyAIs: EnemyAIController[] = [];

  private readonly labLevels: LabUpgradeLevels = {
    workers: 1,
    infantry: 1,
    ranged: 1,
    machines: 1,
    hero: 1,
  };

  private currentLevel: LevelDefinition = CAMPAIGN_LEVELS[0]!;
  private levelEnded = false;
  private autosaveTimer = 0;
  private dustStepAccumulator = 0;

  private readonly loop: GameLoop;
  private readonly hud: HUD;
  private readonly minimap: Minimap;
  private readonly selectionBar: SelectionBar;
  private readonly buildSheet: BuildSheet;
  private readonly armoryPanel: ArmoryPanel;
  private readonly powerBar: PowerBar;
  private readonly techPanel: TechPanel;
  private readonly notifications: NotificationManager;
  private readonly tutorial: TutorialOverlay;
  private readonly levelSelect: LevelSelectScreen;
  private readonly menus: MenusManager;
  private readonly desktopInput: MouseKeyboardController;
  private readonly touchInput: TouchController;

  private pendingBuildType: Exclude<BuildingType, 'base'> | null = null;
  private pendingBuildTile: TileCoord = { tx: 20, tz: 20 };
  private relocateCampPending = false;
  private minimapCollapsed = false;

  public constructor() {
    const canvas = document.getElementById('game-canvas');
    const uiLayer = document.getElementById('ui-layer');
    const damageOverlay = document.getElementById('damage-overlay');
    if (
      !(canvas instanceof HTMLCanvasElement) ||
      !uiLayer ||
      !damageOverlay
    ) {
      throw new Error('Missing #game-canvas, #ui-layer, or #damage-overlay');
    }

    this.sceneSetup = new SceneSetup(canvas, this.settings, this.bus);
    this.cameraRig = new CameraRig(this.settings, 96);
    this.effects = new EffectsManager(this.settings);
    this.sceneSetup.scene.add(this.entityGroup, this.effects.root);

    this.commandResolver = new CommandResolver(this.bus);

    this.loop = new GameLoop(
      this.bus,
      this.settings,
      (dt) => this.onSimulate(dt),
      (_alpha, frameDelta) => this.onRender(frameDelta),
    );

    uiLayer.innerHTML = '';
    this.notifications = new NotificationManager(
      uiLayer,
      damageOverlay,
      this.bus,
      (pos) => this.cameraRig.jumpTo(pos),
    );

    this.hud = new HUD(uiLayer, {
      onRotateCamera: () => {
        this.sfx.playTap();
        this.haptics.tap();
        this.cameraRig.rotate90(1);
      },
      onTogglePause: () => {
        this.sfx.playTap();
        this.haptics.tap();
        const next = !this.loop.isPaused();
        this.loop.setPaused(next);
        return next;
      },
      onSaveGame: () => {
        this.sfx.playBuildComplete();
        this.haptics.buildComplete();
        const activeSlot = this.saveSystem.getActiveSlot();
        this.performSave(activeSlot);
        this.notifications.pushToast(
          `💾 Saved Game to Slot ${activeSlot}!`,
          'success',
        );
      },
      onLoadGame: () => {
        this.sfx.playTap();
        this.loop.setPaused(true);
        this.hud.setPauseButtonLabel(true);
        this.menus.showSavedGamesModal();
      },
      onRestartLevel: () => {
        this.restartCurrentLevel();
      },
      onOpenMainMenu: () => {
        this.sfx.playTap();
        this.loop.setPaused(true);
        this.hud.setPauseButtonLabel(true);
        const hasSave = this.saveSystem.loadMostRecentBattle() !== null;
        this.menus.showMainMenu(hasSave);
      },
      onJumpToPosition: (pos) => {
        this.sfx.playTap();
        this.cameraRig.jumpTo(pos);
      },
    });

    const { ordersBar, actionsBar, bottomStack } =
      this.buildStackedBottomDock(uiLayer);

    this.minimap = new Minimap(bottomStack, 96, (worldPos) => {
      this.cameraRig.jumpTo(worldPos);
    });

    this.minimap.container.style.cssText = `
      position: relative;
      align-self: flex-start;
      padding: 5px;
      border-radius: 12px;
      background: rgba(28, 21, 16, 0.48);
      border: 1.5px solid rgba(242, 190, 73, 0.48);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(4px);
      opacity: 0.76;
      pointer-events: auto;
      display: flex;
    `;
    bottomStack.replaceChildren(
      this.minimap.container,
      ordersBar,
      actionsBar,
    );
    this.minimap.setCollapsed(false);

    this.buildSheet = new BuildSheet(uiLayer, {
      onSelectBuildingToPlace: (bType) => {
        this.sfx.playTap();
        this.haptics.tap();
        this.commandResolver.clearSelection();
        this.selectionBar.setPopupOpen(false);
        this.refreshSelectionUI();

        this.pendingBuildType = bType;
        const fp = BUILDINGS[bType].footprint;
        const target = this.cameraRig.getTarget();

        this.pendingBuildTile = this.world.grid.findNearestValidBuildTile(
          Math.round(target.x - fp * 0.5),
          Math.round(target.z - fp * 0.5),
          fp,
        );
        const isValid = this.world.grid.canPlaceBuilding(
          this.pendingBuildTile.tx,
          this.pendingBuildTile.tz,
          fp,
        );
        this.updateGhostPreview();
        this.buildSheet.showPlacementConfirmBar(
          true,
          BUILDINGS[bType].name,
          isValid,
        );
      },
      onConfirmPlacement: () => {
        if (!this.pendingBuildType) return;
        const playerState = this.factions.get('player')!;
        const bld = ConstructionSystem.tryStartBuildingPlacement(
          this.pendingBuildType,
          this.pendingBuildTile,
          playerState,
          this.buildings.values(),
          this.world.grid,
          this.bus,
        );
        if (bld) {
          this.sfx.playBuildComplete();
          this.haptics.buildComplete();
          this.addBuilding(bld);
          this.assignNearestIdleWorkerToBuild(bld);
          this.pendingBuildType = null;
          this.effects.updatePlacementGhost(
            false,
            { x: 0, z: 0 },
            1,
            true,
            this.world.heightMap,
          );
          this.buildSheet.showPlacementConfirmBar(false);
          this.recomputeFogAndMeshes();
        }
      },
      onCancelPlacement: () => {
        this.sfx.playTap();
        this.pendingBuildType = null;
        this.effects.updatePlacementGhost(
          false,
          { x: 0, z: 0 },
          1,
          true,
          this.world.heightMap,
        );
        this.buildSheet.showPlacementConfirmBar(false);
      },
      onUpdatePriority: (res, val) => {
        const playerState = this.factions.get('player')!;
        playerState.workerPriorities[res] = val;
      },
    });

    this.armoryPanel = new ArmoryPanel(uiLayer, {
      onUpgradeWeaponTier: (role) => {
        this.sfx.playBuildComplete();
        const playerState = this.factions.get('player')!;
        const armory = this.findPlayerBuilding('armory');
        if (
          EquipmentSystem.tryUpgradeUnitWeaponTier(
            role,
            playerState,
            armory,
            this.bus,
          )
        ) {
          this.rebuildPlayerUnitMeshes();
          this.selectionBar.invalidate();
        }
      },
      onUpgradeArmorTier: (role) => {
        this.sfx.playBuildComplete();
        const playerState = this.factions.get('player')!;
        const armory = this.findPlayerBuilding('armory');
        if (
          EquipmentSystem.tryUpgradeUnitArmorTier(
            role,
            playerState,
            armory,
            this.bus,
          )
        ) {
          this.rebuildPlayerUnitMeshes();
          this.selectionBar.invalidate();
        }
      },
      onCraftEmergencyWeapon: (itemType) => {
        this.sfx.playBuildComplete();
        const playerState = this.factions.get('player')!;
        const station = this.findPlayerBuilding('weapon_station');
        if (station) {
          EquipmentSystem.tryCraftWeaponStationItem(
            station,
            itemType,
            playerState,
            this.bus,
          );
        }
      },
    });

    this.powerBar = new PowerBar(uiLayer, ordersBar, {
      onSelectSpiritPowerToAim: (powerId) => {
        this.sfx.playTap();
        this.powerBar.setAimingPower(powerId);
        this.notifications.pushToast(
          'Tap anywhere on the battlefield to unleash Spirit Power!',
          'info',
        );
      },
      onTriggerHeroAbility: () => {
        const hero = this.findPlayerHero();
        const playerState = this.factions.get('player')!;
        if (
          PowersSystem.castHeroAbility(
            hero,
            playerState,
            this.units,
            this.buildings,
            this.factions,
            this.world.grid,
            this.bus,
          )
        ) {
          this.sfx.playPowerCast();
          this.haptics.powerCast();
        }
      },
    });

    this.techPanel = new TechPanel(uiLayer, {
      onStartResearch: (techId) => {
        this.sfx.playTap();
        TechSystem.startResearch(
          techId,
          this.factions.get('player')!,
          this.buildings.values(),
          this.bus,
        );
      },
      onUpgradeLabCategory: (category) => {
        this.applyLabCategoryUpgrade(category);
      },
    });

    this.selectionBar = new SelectionBar(uiLayer, {
      onToggleStructureMode: (buildingId) => {
        this.sfx.playTap();
        this.haptics.tap();
        const bld = this.buildings.get(buildingId);
        if (!bld) return;
        const nextMode = bld.mode === 'stand' ? 'move' : 'stand';
        if (bld.buildingType === 'base') {
          setBaseMode(bld, nextMode);
        } else {
          setBuildingMode(bld, nextMode);
        }
        this.effects.clearPathPreview();
        this.selectionBar.setTravelEstimate(
          nextMode === 'move'
            ? 'Tap or Right-Click ground to walk structure'
            : null,
        );
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      },
      onRelocateSelectedBuildings: () => {
        this.sfx.playTap();
        this.relocateCampPending = true;
        this.selectionBar.setTravelEstimate(
          'Relocate Camp active: Tap or Right-Click destination',
        );
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      },
      onTrainItem: (buildingId, itemType) => {
        this.sfx.playTap();
        const bld = this.buildings.get(buildingId);
        const playerState = this.factions.get('player')!;
        if (bld) {
          ProductionSystem.enqueueUnitOrItem(
            bld,
            itemType as UnitRole | MachineRole,
            playerState,
            this.bus,
          );
          this.selectionBar.invalidate();
          this.refreshSelectionUI();
        }
      },
      onToggleRepeatQueue: (buildingId) => {
        this.sfx.playTap();
        const bld = this.buildings.get(buildingId);
        if (bld) {
          bld.repeatQueue = !bld.repeatQueue;
          this.selectionBar.invalidate();
          this.refreshSelectionUI();
        }
      },
      onUpgradeBuilding: (buildingId) => {
        this.handleBuildingUpgradeWithRewards(buildingId);
      },
      onDestroyBuilding: (buildingId) => {
        this.handleDestroyBuilding(buildingId);
      },
      onToggleUnitStance: () => {
        this.sfx.playTap();
        for (const id of this.commandResolver.getSelectedIds()) {
          const u = this.units.get(id);
          if (u && u.faction === 'player') {
            u.stance =
              u.stance === 'aggressive' ? 'hold_position' : 'aggressive';
          }
        }
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      },
      onStopSelected: () => {
        this.sfx.playTap();
        for (const id of this.commandResolver.getSelectedIds()) {
          const u = this.units.get(id);
          if (u) {
            u.path = [];
            u.moveTarget = null;
            u.targetEntityId = null;
            u.status = 'idle';
          }
          const b = this.buildings.get(id);
          if (b) {
            b.path = [];
            b.moveTarget = null;
          }
        }
        this.effects.clearPathPreview();
        this.selectionBar.setTravelEstimate(null);
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      },
      onCollapse: () => {
        this.selectionBar.setPopupOpen(false);
        this.refreshSelectionUI();
      },
    });

    this.tutorial = new TutorialOverlay(uiLayer);

    this.levelSelect = new LevelSelectScreen(uiLayer, {
      onLaunchLevel: (lvl, tribe) => {
        this.sfx.playBuildComplete();
        this.startLevel(lvl, tribe);
        this.loop.setPaused(false);
        this.hud.setPauseButtonLabel(false);
        uiLayer.classList.remove('welcome-active');
      },
      onBackToMainMenu: () => {
        const hasSave = this.saveSystem.loadMostRecentBattle() !== null;
        this.menus.showMainMenu(hasSave);
      },
    });

    this.menus = new MenusManager(uiLayer, this.settings, {
      onOpenCampaign: () => {
        const progress = this.saveSystem.loadProgress();
        this.levelSelect.show(progress.starsByLevel);
      },
      onStartSkirmish: (lvl, tribe) => {
        this.startLevel(lvl, tribe);
        this.loop.setPaused(false);
        this.hud.setPauseButtonLabel(false);
        uiLayer.classList.remove('welcome-active');
      },
      onResumeCurrentBattle: () => {
        this.loop.setPaused(false);
        this.hud.setPauseButtonLabel(false);
        uiLayer.classList.remove('welcome-active');
      },
      onRestartLevel: () => {
        this.restartCurrentLevel();
        uiLayer.classList.remove('welcome-active');
      },
      onLoadSavedSlot: (slot) => {
        const snap = this.saveSystem.loadBattle(slot);
        if (snap) {
          this.saveSystem.setActiveSlot(slot);
          this.restoreFromSnapshot(snap);
          this.loop.setPaused(false);
          this.hud.setPauseButtonLabel(false);
          uiLayer.classList.remove('welcome-active');
          this.notifications.pushToast(
            `📂 Loaded Save Slot ${slot}!`,
            'success',
          );
        }
      },
      onSaveToSlot: (slot) => {
        this.saveSystem.setActiveSlot(slot);
        this.performSave(slot);
        this.notifications.pushToast(
          `💾 Saved Battle to Slot ${slot}!`,
          'success',
        );
      },
      onEraseSlot: (slot) => {
        this.sfx.playTap();
        this.saveSystem.eraseSlot(slot);
        this.notifications.pushToast(
          `🗑️ Erased Save Slot ${slot}.`,
          'info',
        );
      },
      onSelectActiveSlot: (slot) => {
        this.saveSystem.setActiveSlot(slot);
      },
      onGetSaveSlotsState: () => ({
        activeSlot: this.saveSystem.getActiveSlot(),
        slots: this.saveSystem.getAllSlots(),
      }),
      onVisibilityChange: (welcomeVisible) => {
        uiLayer.classList.toggle('welcome-active', welcomeVisible);
      },
    });

    this.touchInput = new TouchController(canvas, this.cameraRig, {
      onTap: (_screen, worldPos) =>
        this.handlePointerInteraction(worldPos, false, true),
      onDoubleTap: (_screen, worldPos) => {
        this.sfx.playTap();
        this.commandResolver.handleDoubleTap(worldPos, this.getCommandContext());
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      },
      onLongPress: (_screen, worldPos) => {
        this.haptics.stomp();
        this.handleCommandPoint(worldPos);
      },
      onBoxSelect: (startW, endW) => {
        this.commandResolver.handleBoxSelect(
          startW,
          endW,
          this.getCommandContext(),
        );
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      },
      onDragMoveGhost: (worldPos) => {
        if (!this.pendingBuildType) return false;
        const fp = BUILDINGS[this.pendingBuildType].footprint;
        const desiredTx = Math.round(worldPos.x - fp * 0.5);
        const desiredTz = Math.round(worldPos.z - fp * 0.5);
        this.pendingBuildTile = this.world.grid.findNearestValidBuildTile(
          desiredTx,
          desiredTz,
          fp,
          4,
        );
        this.updateGhostPreview();
        return true;
      },
    });

    this.desktopInput = new MouseKeyboardController(canvas, this.cameraRig, {
      onLeftClick: (_screen, worldPos, shiftKey) =>
        this.handlePointerInteraction(worldPos, shiftKey, false),
      onDoubleClick: (_screen, worldPos) => {
        this.commandResolver.handleDoubleTap(worldPos, this.getCommandContext());
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      },
      onRightClick: (_screen, worldPos) => this.handleCommandPoint(worldPos),
      onBoxSelect: (startW, endW) => {
        this.commandResolver.handleBoxSelect(
          startW,
          endW,
          this.getCommandContext(),
        );
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      },
      onHoverWorld: () => {},
      onKeyCommand: (code) => {
        if (code === 'Space') {
          const next = !this.loop.isPaused();
          this.loop.setPaused(next);
          this.hud.setPauseButtonLabel(next);
        } else if (code === 'KeyM') {
          const first = this.commandResolver.getSelectedIds()[0];
          const bld = first ? this.buildings.get(first) : undefined;
          if (bld && bld.faction === 'player') {
            const next = bld.mode === 'stand' ? 'move' : 'stand';
            if (bld.buildingType === 'base') setBaseMode(bld, next);
            else setBuildingMode(bld, next);
            this.selectionBar.invalidate();
            this.refreshSelectionUI();
          }
        } else if (code === 'KeyH') {
          const hero = this.findPlayerHero();
          PowersSystem.castHeroAbility(
            hero,
            this.factions.get('player')!,
            this.units,
            this.buildings,
            this.factions,
            this.world.grid,
            this.bus,
          );
        } else if (code === 'F3' || code === 'KeyD') {
          this.hud.toggleDebugPanel();
        }
      },
    });

    this.bindBusEvents();

    const mostRecentSave = this.saveSystem.loadMostRecentBattle();
    if (mostRecentSave) {
      this.restoreFromSnapshot(mostRecentSave);
    } else {
      this.startLevel(CAMPAIGN_LEVELS[0]!, 'stonebacks');
    }

    this.loop.setPaused(true);
    this.hud.setPauseButtonLabel(true);
    this.menus.showMainMenu(mostRecentSave !== null);

    if (this.saveSystem.wasCorruptSaveDetected()) {
      this.notifications.pushToast(
        'Corrupt save data was reset to a clean state.',
        'warning',
      );
    }

    window.addEventListener('resize', () => {
      this.cameraRig.onResize();
      this.sceneSetup.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.performSave(this.saveSystem.getActiveSlot());
      }
    });

    this.loop.start();
  }

  /**
   * Restarts the current level cleanly with the player's active tribe.
   */
  private restartCurrentLevel(): void {
    this.sfx.playBuildComplete();
    this.haptics.buildComplete();
    const playerTribe =
      this.factions.get('player')?.tribe ??
      this.currentLevel.playerTribeDefault ??
      'stonebacks';
    this.startLevel(this.currentLevel, playerTribe);
    this.loop.setPaused(false);
    this.hud.setPauseButtonLabel(false);
    this.menus.hideAll();
    this.notifications.pushToast(
      `🔄 Restarted ${this.currentLevel.name}!`,
      'info',
    );
  }

  /**
   * Demolishes a non-base player building, frees its grid footprint, and refunds 50% of its cost.
   */
  private handleDestroyBuilding(buildingId: EntityId): void {
    const bld = this.buildings.get(buildingId);
    if (!bld || bld.faction !== 'player') return;
    if (bld.buildingType === 'base') {
      this.notifications.pushToast(
        'Cannot destroy your Council Walker Base!',
        'warning',
      );
      return;
    }

    const def = BUILDINGS[bld.buildingType];
    const playerState = this.factions.get('player')!;

    // Refund 50% of base building cost
    const refundParts: string[] = [];
    for (const [resKey, amount] of Object.entries(def.cost)) {
      const refund = Math.floor((amount ?? 0) * 0.5);
      if (refund > 0) {
        const r = resKey as ResourceType;
        playerState.resources[r] = Math.min(
          playerState.storageCaps[r],
          playerState.resources[r] + refund,
        );
        refundParts.push(`+${refund} ${r}`);
      }
    }

    // Clear footprint & remove 3D mesh
    this.world.grid.setBuildingFootprint(bld.tile, bld.footprint, null);
    const mesh = this.buildingMeshes.get(buildingId);
    if (mesh) {
      this.entityGroup.remove(mesh);
      this.buildingMeshes.delete(buildingId);
    }
    this.buildings.delete(buildingId);

    // Free any workers that were assigned to build/repair this building
    for (const u of this.units.values()) {
      if (
        u.faction === 'player' &&
        u.role === 'worker' &&
        u.jobMemory.targetEntityId === buildingId
      ) {
        u.jobMemory.jobType = 'none';
        u.jobMemory.targetEntityId = null;
        u.status = 'idle';
        u.path = [];
      }
    }

    this.sfx.playStomp();
    this.haptics.tap();
    this.effects.spawnDustPuff(bld.position, this.world.heightMap);
    this.commandResolver.clearSelection();
    this.selectionBar.setPopupOpen(false);
    this.recomputeFogAndMeshes();
    this.refreshSelectionUI();
    this.notifications.pushToast(
      `🗑️ Demolished ${def.name} (${refundParts.join(', ') || 'Cleared'})`,
      'info',
    );
  }

  private buildStackedBottomDock(uiLayer: HTMLElement): {
    bottomStack: HTMLElement;
    ordersBar: HTMLElement;
    actionsBar: HTMLElement;
  } {
    const bottomStack = document.createElement('div');
    bottomStack.className = 'bottom-hud-stack';
    bottomStack.style.cssText = `
      position: fixed;
      bottom: calc(var(--safe-bottom) + 8px);
      left: calc(var(--safe-left) + 8px);
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 5px;
      z-index: 22;
      pointer-events: none;
    `;

    const ordersBar = document.createElement('div');
    ordersBar.className = 'icon-dock-bar';
    ordersBar.innerHTML = `
      <button id="btn-defend-base" class="sw-btn sw-btn-danger sw-icon-btn" title="Defend Base — Recall all Troops & Machines">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4 5v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V5l-8-3z"/></svg>
        <span class="icon-btn-sub">Defend</span>
      </button>
      <button id="btn-idle-workers" class="sw-btn sw-icon-btn" title="Select Idle Workers">
        <svg viewBox="0 0 24 24" fill="#f2be49"><path d="M14 4l6 6-2 2-6-6 2-2zM4 20l9-9 2 2-9 9H4v-2z"/></svg>
        <span class="icon-btn-sub">Idle</span>
        <span id="badge-idle-count" class="icon-btn-badge">0</span>
      </button>
      <button id="btn-box-select" class="sw-btn sw-icon-btn" title="Toggle Touch Box-Selection Mode">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="4 2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
        <span id="label-box-select" class="icon-btn-sub">Box:OFF</span>
      </button>
      <button id="btn-toggle-map" class="sw-btn sw-btn-primary sw-icon-btn" title="Toggle World Radar Map">
        <svg viewBox="0 0 24 24" fill="#1f1105"><polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/></svg>
        <span id="label-map-toggle" class="icon-btn-sub">Map:ON</span>
      </button>
      <button id="btn-order-stats" class="sw-btn sw-btn-success sw-icon-btn" style="display:none;" title="Open / Hide Selected Stats Card">
        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="13" width="4" height="8" rx="1"/><rect x="10" y="9" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="17" rx="1"/></svg>
        <span id="label-order-stats" class="icon-btn-sub">Stats</span>
        <span id="badge-selected-count" class="icon-btn-badge" style="display:none;">1</span>
      </button>
      <button id="btn-order-deselect" class="sw-btn sw-btn-danger sw-icon-btn" style="display:none;" title="Cancel Selection">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
        <span class="icon-btn-sub">Cancel</span>
      </button>
    `;

    const actionsBar = document.createElement('div');
    actionsBar.className = 'icon-dock-bar';
    actionsBar.innerHTML = `
      <button id="btn-open-build" class="sw-btn sw-btn-primary sw-icon-btn" title="Build Camp Buildings">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm9-18L3 10h3v7h12v-7h3L12 3z"/></svg>
        <span class="icon-btn-sub">Build</span>
      </button>
      <button id="btn-open-research" class="sw-btn sw-icon-btn" title="Research Hall — Lab Unit Upgrades & Tech Tree">
        <svg viewBox="0 0 24 24" fill="#38bdf8"><path d="M9 3v6L4 19a2 2 0 002 2h12a2 2 0 002-2l-5-10V3H9z"/></svg>
        <span class="icon-btn-sub">Lab</span>
      </button>
      <button id="btn-open-armory" class="sw-btn sw-icon-btn" title="Tribal Armory & Weapon Station Stock">
        <svg viewBox="0 0 24 24" fill="#f59e0b"><path d="M6.92 5H5l9 9 1-.94m4.96 6.06l-.84.84a1 1 0 01-1.41 0l-3.12-3.12-2.68 2.66-1.41-1.41 1.42-1.42L3 7.75V3h4.75l8.92 8.92 1.42-1.42 1.41 1.41-2.67 2.67 3.12 3.12a1 1 0 01.01 1.42z"/></svg>
        <span class="icon-btn-sub">Armory</span>
      </button>
      <button id="btn-open-powers" class="sw-btn sw-icon-btn" title="Spirit Powers (Healing Rain, Rally, Fire Rain, Earthquake)">
        <svg viewBox="0 0 24 24" fill="#f2be49"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/></svg>
        <span class="icon-btn-sub">Powers</span>
      </button>
      <button id="btn-select-army" class="sw-btn sw-icon-btn" title="Select All Combat Army & Machines">
        <svg viewBox="0 0 24 24" fill="#ef4444"><polygon points="12,2 19,9 15,9 15,21 9,21 9,9 5,9"/></svg>
        <span class="icon-btn-sub">Army</span>
      </button>
      <button id="btn-select-camp" class="sw-btn sw-icon-btn" title="Select All Camp Buildings (for Relocate Camp)">
        <svg viewBox="0 0 24 24" fill="#cbbba2"><rect x="3" y="10" width="7" height="11" rx="1"/><rect x="14" y="6" width="7" height="15" rx="1"/></svg>
        <span class="icon-btn-sub">Camp</span>
      </button>
    `;

    bottomStack.append(ordersBar, actionsBar);
    uiLayer.appendChild(bottomStack);

    actionsBar
      .querySelector('#btn-open-build')
      ?.addEventListener('click', () => {
        this.sfx.playTap();
        this.armoryPanel.close();
        this.powerBar.close();
        this.techPanel.close();
        const baseLv = ConstructionSystem.getFactionBaseLevel(
          'player',
          this.buildings.values(),
        );
        this.buildSheet.toggle(this.factions.get('player')!, baseLv);
      });

    actionsBar
      .querySelector('#btn-open-armory')
      ?.addEventListener('click', () => {
        this.sfx.playTap();
        this.buildSheet.close();
        this.powerBar.close();
        this.techPanel.close();
        this.armoryPanel.toggle(
          this.factions.get('player')!,
          this.findPlayerBuilding('weapon_station'),
        );
      });

    actionsBar
      .querySelector('#btn-open-powers')
      ?.addEventListener('click', () => {
        this.sfx.playTap();
        this.buildSheet.close();
        this.armoryPanel.close();
        this.techPanel.close();
        this.powerBar.toggleSheet(
          this.factions.get('player')!,
          this.buildings.values(),
        );
      });

    actionsBar
      .querySelector('#btn-open-research')
      ?.addEventListener('click', () => {
        this.sfx.playTap();
        this.buildSheet.close();
        this.armoryPanel.close();
        this.powerBar.close();
        this.techPanel.toggle(
          this.factions.get('player')!,
          this.buildings.values(),
          this.labLevels,
        );
      });

    actionsBar
      .querySelector('#btn-select-army')
      ?.addEventListener('click', () => {
        this.sfx.playTap();
        const armyIds: EntityId[] = [];
        for (const u of this.units.values()) {
          if (
            u.hp > 0 &&
            !u.isReviving &&
            u.faction === 'player' &&
            u.role !== 'worker'
          ) {
            armyIds.push(u.id);
          }
        }
        if (armyIds.length === 0) {
          this.notifications.pushToast(
            'No combat troops or machines available.',
            'info',
          );
          return;
        }
        this.commandResolver.setSelectedIds(armyIds);
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      });

    actionsBar
      .querySelector('#btn-select-camp')
      ?.addEventListener('click', () => {
        this.sfx.playTap();
        const bldIds: EntityId[] = [];
        for (const b of this.buildings.values()) {
          if (b.hp > 0 && b.faction === 'player') {
            bldIds.push(b.id);
          }
        }
        this.commandResolver.setSelectedIds(bldIds);
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      });

    ordersBar
      .querySelector('#btn-defend-base')
      ?.addEventListener('click', () => {
        this.sfx.playAlarmHorn();
        this.haptics.alarm();
        AlarmResponseSystem.recallArmyToDefendBase(
          this.factions.get('player')!,
          this.units.values(),
          this.buildings.values(),
          this.world.grid,
        );
        this.notifications.pushToast(
          'All troops and machines recalled to guard the Base!',
          'info',
        );
      });

    ordersBar
      .querySelector('#btn-idle-workers')
      ?.addEventListener('click', () => {
        this.sfx.playTap();
        const idleIds: EntityId[] = [];
        for (const u of this.units.values()) {
          if (
            u.faction === 'player' &&
            u.role === 'worker' &&
            u.hp > 0 &&
            u.status === 'idle'
          ) {
            idleIds.push(u.id);
          }
        }
        if (idleIds.length > 0) {
          this.commandResolver.setSelectedIds(idleIds);
          const first = this.units.get(idleIds[0]!);
          if (first) this.cameraRig.jumpTo(first.position);
          this.selectionBar.invalidate();
          this.refreshSelectionUI();
        } else {
          this.notifications.pushToast(
            'All workers are currently busy!',
            'info',
          );
        }
      });

    ordersBar
      .querySelector('#btn-box-select')
      ?.addEventListener('click', (e) => {
        this.sfx.playTap();
        const nextMode = !this.touchInput.isBoxSelectMode();
        this.touchInput.setBoxSelectMode(nextMode);
        const btn = e.currentTarget as HTMLButtonElement;
        const lbl = btn.querySelector('#label-box-select');
        if (lbl) lbl.textContent = nextMode ? 'Box:ON' : 'Box:OFF';
        btn.classList.toggle('sw-btn-primary', nextMode);
      });

    ordersBar
      .querySelector('#btn-toggle-map')
      ?.addEventListener('click', (e) => {
        this.sfx.playTap();
        this.minimapCollapsed = !this.minimapCollapsed;
        this.minimap.setCollapsed(this.minimapCollapsed);
        const btn = e.currentTarget as HTMLButtonElement;
        const lbl = btn.querySelector('#label-map-toggle');
        const isVisible = !this.minimapCollapsed;
        if (lbl) lbl.textContent = isVisible ? 'Map:ON' : 'Map:OFF';
        btn.classList.toggle('sw-btn-primary', isVisible);
      });

    ordersBar
      .querySelector('#btn-order-stats')
      ?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sfx.playTap();
        this.haptics.tap();
        this.buildSheet.close();
        this.armoryPanel.close();
        this.powerBar.close();
        this.techPanel.close();
        this.selectionBar.togglePopup();
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
      });

    ordersBar
      .querySelector('#btn-order-deselect')
      ?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sfx.playTap();
        this.haptics.tap();
        this.commandResolver.clearSelection();
        this.selectionBar.setPopupOpen(false);
        this.effects.clearPathPreview();
        this.refreshSelectionUI();
      });

    return { bottomStack, ordersBar, actionsBar };
  }

  private handleBuildingUpgradeWithRewards(buildingId: EntityId): void {
    const bld = this.buildings.get(buildingId);
    if (!bld || !bld.isConstructed) return;
    const playerState = this.factions.get('player')!;
    const def = BUILDINGS[bld.buildingType];
    if (bld.level >= def.maxLevel) return;

    let cost: Partial<FactionState['resources']>;
    if (bld.buildingType === 'base') {
      const nextTier = BASE_TIER_STATS[bld.level];
      if (!nextTier) return;
      cost = nextTier.upgradeCost;
    } else {
      const mult = bld.level;
      cost = {
        wood: Math.round((def.cost.wood ?? 60) * 0.8 * mult),
        stone: Math.round((def.cost.stone ?? 50) * 0.8 * mult),
      };
    }

    if (!ConstructionSystem.canAfford(playerState.resources, cost)) {
      this.notifications.pushToast(
        `Not enough resources to upgrade ${def.name}.`,
        'warning',
      );
      return;
    }

    ConstructionSystem.spendResources(playerState.resources, cost);
    bld.level += 1;

    if (bld.buildingType === 'base') {
      const tier = BASE_TIER_STATS[bld.level - 1]!;
      bld.maxHp = tier.maxHp;
      bld.hp = tier.maxHp;
    } else {
      bld.maxHp = Math.round(bld.maxHp * 1.45);
      bld.hp = bld.maxHp;
    }

    const unlockTech = (techId: string): void => {
      if (!playerState.researchedTechs.includes(techId)) {
        playerState.researchedTechs.push(techId);
      }
    };

    switch (bld.buildingType) {
      case 'base':
        if (bld.level === 2) {
          unlockTech('wheelwright_craft');
          unlockTech('bronze_smelting');
          unlockTech('bone_walker_frame');
          this.notifications.pushToast(
            '🔓 Base Lv.2 Unlocked: Sling Range, Tannery, Beast Pen, Armory, Lab & Spirit Totem!',
            'success',
          );
        } else if (bld.level === 3) {
          unlockTech('bronze_sovereign_frame');
          unlockTech('colossus_engineering');
          unlockTech('bronze_titans');
          this.notifications.pushToast(
            '🔓 Base Lv.3 Unlocked: Machine Workshop, Bronze Smeltery, Titan Walker & Earthquake!',
            'success',
          );
        }
        break;

      case 'barracks':
        if (bld.level === 2) {
          unlockTech('stone_weaponry');
          unlockTech('bone_shields');
        } else if (bld.level === 3) {
          unlockTech('bronze_metallurgy');
        }
        for (const u of this.units.values()) {
          if (
            u.faction === 'player' &&
            (u.role === 'clubber' ||
              u.role === 'spearman' ||
              u.role === 'shield_bearer')
          ) {
            u.maxHp = Math.round(u.maxHp * 1.2);
            u.hp = u.maxHp;
          }
        }
        break;

      case 'sling_range':
        if (bld.level === 2) {
          unlockTech('sinew_bows');
        } else if (bld.level === 3) {
          unlockTech('spirit_chants');
        }
        break;

      case 'machine_workshop':
        unlockTech('wheelwright_craft');
        if (bld.level === 2) {
          unlockTech('torsion_frames');
          unlockTech('carapace_plating');
        } else if (bld.level === 3) {
          unlockTech('pitch_alchemy');
          unlockTech('colossus_engineering');
          unlockTech('bronze_titans');
        }
        break;

      case 'beast_pen': {
        const beastRole = bld.level === 2 ? 'sabertooth' : 'mammoth';
        const tamedBeast = createBeastEntity({
          role: beastRole,
          faction: 'player',
          position: {
            x: bld.position.x + 2.5,
            z: bld.position.z + 2.5,
          },
        });
        this.addUnit(tamedBeast);
        break;
      }

      case 'spirit_totem': {
        if (bld.level === 2) {
          unlockTech('totem_awakening');
          unlockTech('sky_fire_ritual');
        } else if (bld.level === 3) {
          unlockTech('bronze_sovereign_frame');
        }
        let hero = this.findPlayerHero();
        if (!hero) {
          hero = createHeroEntity({
            faction: 'player',
            tribe: playerState.tribe,
            position: { x: bld.position.x + 2, z: bld.position.z + 2 },
          });
          this.addUnit(hero);
        } else {
          hero.isReviving = false;
          hero.maxHp += 250;
          hero.hp = hero.maxHp;
          hero.heroAbilityCooldownTimer = 0;
        }
        break;
      }

      case 'armory': {
        const newTier = Math.min(3, bld.level) as WeaponTier;
        const newArmorTier = Math.min(3, bld.level) as ArmorTier;
        playerState.unlockedWeaponTier = newTier;
        playerState.unlockedArmorTier = newArmorTier;
        if (bld.level === 2) unlockTech('bone_shields');
        if (bld.level === 3) unlockTech('bronze_metallurgy');
        for (const r of Object.keys(playerState.unitWeaponTiers) as UnitRole[]) {
          if (playerState.unitWeaponTiers[r] < newTier) {
            playerState.unitWeaponTiers[r] = newTier;
          }
          if (playerState.unitArmorTiers[r] < newArmorTier) {
            playerState.unitArmorTiers[r] = newArmorTier;
          }
        }
        this.rebuildPlayerUnitMeshes();
        break;
      }

      case 'research_hall':
        if (bld.level === 2) {
          unlockTech('flint_tools');
          unlockTech('woven_baskets');
          unlockTech('bone_chisels');
        } else if (bld.level === 3) {
          unlockTech('bronze_smelting');
          unlockTech('pack_harnesses');
        }
        break;
    }

    const rewardSummary = getBuildingLevelRewardText(
      bld.buildingType,
      bld.level,
    );
    this.sfx.playBuildComplete();
    this.haptics.buildComplete();
    this.effects.spawnFloatingText(
      `Lv.${bld.level}!`,
      bld.position,
      '#ffd24c',
      this.world.heightMap,
    );
    if (bld.buildingType !== 'base') {
      this.notifications.pushToast(
        `🎁 ${def.name} Lv.${bld.level}: ${rewardSummary}!`,
        'success',
      );
    }
    this.selectionBar.invalidate();
    this.refreshSelectionUI();
  }

  private applyLabCategoryUpgrade(category: LabUpgradeCategory): void {
    const playerState = this.factions.get('player')!;
    const curLv = this.labLevels[category];
    if (curLv >= 5) return;

    const cost = TechPanel.getLabUpgradeCost(category, curLv);
    if (!ConstructionSystem.canAfford(playerState.resources, cost)) {
      this.notifications.pushToast(
        'Not enough resources for Lab Upgrade!',
        'warning',
      );
      return;
    }

    ConstructionSystem.spendResources(playerState.resources, cost);
    this.labLevels[category] = curLv + 1;
    const nextLv = this.labLevels[category];

    const unlockTech = (techId: string): void => {
      if (!playerState.researchedTechs.includes(techId)) {
        playerState.researchedTechs.push(techId);
      }
    };

    if (category === 'workers') {
      unlockTech('flint_tools');
      if (nextLv >= 2) unlockTech('woven_baskets');
      if (nextLv >= 3) unlockTech('bone_chisels');
      if (nextLv >= 4) unlockTech('pack_harnesses');
      for (const u of this.units.values()) {
        if (u.faction === 'player' && u.role === 'worker') {
          u.maxHp = Math.round(u.maxHp * 1.25);
          u.hp = u.maxHp;
          u.speed = +(u.speed * 1.12).toFixed(2);
        }
      }
    } else if (category === 'infantry') {
      unlockTech('stone_weaponry');
      if (nextLv >= 2) unlockTech('bone_shields');
      if (nextLv >= 3) unlockTech('bronze_metallurgy');
      const wTier = Math.min(3, nextLv - 1) as WeaponTier;
      const aTier = Math.min(3, nextLv - 1) as ArmorTier;
      for (const role of [
        'clubber',
        'spearman',
        'shield_bearer',
      ] as UnitRole[]) {
        playerState.unitWeaponTiers[role] = Math.max(
          playerState.unitWeaponTiers[role],
          wTier,
        ) as WeaponTier;
        playerState.unitArmorTiers[role] = Math.max(
          playerState.unitArmorTiers[role],
          aTier,
        ) as ArmorTier;
      }
      for (const u of this.units.values()) {
        if (
          u.faction === 'player' &&
          (u.role === 'clubber' ||
            u.role === 'spearman' ||
            u.role === 'shield_bearer')
        ) {
          u.maxHp = Math.round(u.maxHp * 1.25);
          u.hp = u.maxHp;
        }
      }
      this.rebuildPlayerUnitMeshes();
    } else if (category === 'ranged') {
      unlockTech('sinew_bows');
      if (nextLv >= 3) unlockTech('spirit_chants');
      const wTier = Math.min(3, nextLv - 1) as WeaponTier;
      const aTier = Math.min(3, nextLv - 1) as ArmorTier;
      for (const role of [
        'slinger',
        'bow_hunter',
        'scout',
        'shaman',
      ] as UnitRole[]) {
        playerState.unitWeaponTiers[role] = Math.max(
          playerState.unitWeaponTiers[role],
          wTier,
        ) as WeaponTier;
        playerState.unitArmorTiers[role] = Math.max(
          playerState.unitArmorTiers[role],
          aTier,
        ) as ArmorTier;
      }
      for (const u of this.units.values()) {
        if (
          u.faction === 'player' &&
          (u.role === 'slinger' ||
            u.role === 'bow_hunter' ||
            u.role === 'shaman' ||
            u.role === 'scout')
        ) {
          u.maxHp = Math.round(u.maxHp * 1.25);
          u.hp = u.maxHp;
        }
      }
      this.rebuildPlayerUnitMeshes();
    } else if (category === 'machines') {
      unlockTech('wheelwright_craft');
      if (nextLv >= 2) {
        unlockTech('torsion_frames');
        unlockTech('carapace_plating');
      }
      if (nextLv >= 3) {
        unlockTech('pitch_alchemy');
        unlockTech('colossus_engineering');
      }
      if (nextLv >= 4) {
        unlockTech('bronze_titans');
      }
      for (const u of this.units.values()) {
        if (u.faction === 'player' && u.kind === 'machine') {
          u.maxHp = Math.round(u.maxHp * 1.3);
          u.hp = u.maxHp;
        }
      }
    } else if (category === 'hero') {
      unlockTech('totem_awakening');
      if (nextLv >= 2) unlockTech('sky_fire_ritual');
      if (nextLv >= 3) unlockTech('bronze_sovereign_frame');
      const hero = this.findPlayerHero();
      if (hero) {
        hero.isReviving = false;
        hero.maxHp += 220;
        hero.hp = hero.maxHp;
        hero.veterancyRank = Math.min(
          3,
          hero.veterancyRank + 1,
        ) as 0 | 1 | 2 | 3;
      }
    }

    this.sfx.playBuildComplete();
    this.haptics.buildComplete();
    this.notifications.pushToast(
      `⚗️ Lab Upgraded ${category.toUpperCase()} to Lv.${nextLv}!`,
      'success',
    );
    this.techPanel.render(
      playerState,
      this.buildings.values(),
      this.labLevels,
    );
    this.selectionBar.invalidate();
  }

  public startLevel(level: LevelDefinition, playerTribe: TribeId): void {
    this.currentLevel = level;
    this.levelEnded = false;
    this.rng = new RNG(level.seed);
    this.weather.setTheme(level.theme, level.weatherDefault);

    this.labLevels.workers = 1;
    this.labLevels.infantry = 1;
    this.labLevels.ranged = 1;
    this.labLevels.machines = 1;
    this.labLevels.hero = 1;

    this.units.clear();
    this.buildings.clear();
    this.projectiles.clear();
    this.activePowerZones.length = 0;
    this.unitMeshes.clear();
    this.buildingMeshes.clear();
    this.entityGroup.clear();
    this.enemyAIs.length = 0;
    this.factions.clear();

    if (this.terrainRenderer) {
      this.sceneSetup.scene.remove(this.terrainRenderer.root);
      this.terrainRenderer.dispose();
    }

    this.world = MapGenerator.generate(level);
    this.fog = new FogOfWar(this.world.size);
    this.cameraRig.setMapSize(this.world.size);
    this.cameraRig.jumpTo(this.world.playerSpawn);

    this.terrainRenderer = new TerrainRenderer(
      this.world.heightMap,
      this.world.theme,
    );
    this.sceneSetup.scene.add(this.terrainRenderer.root);

    this.factions.set(
      'player',
      this.createInitialFactionState('player', playerTribe),
    );
    this.tribeByFaction.set('player', playerTribe);

    this.spawnPlayerStartCamp(this.world.playerSpawn, playerTribe);

    const enemyTribes: TribeId[] = ['ember_tribe', 'reef_clan', 'stonebacks'];
    for (let i = 0; i < this.world.enemySpawns.length; i++) {
      const fId = `enemy_${i + 1}` as FactionId;
      const eTribe = enemyTribes[i % enemyTribes.length]!;
      this.factions.set(fId, this.createInitialFactionState(fId, eTribe));
      this.tribeByFaction.set(fId, eTribe);
      this.spawnEnemyCamp(this.world.enemySpawns[i]!, fId, eTribe, level.id);
      this.enemyAIs.push(
        new EnemyAIController({
          faction: fId,
          difficulty: level.enemyDifficulty,
          nightAttacks: level.enemyNightAttacks,
          baseWalks: level.enemyBaseWalks,
        }),
      );
    }

    const mid = Math.floor(this.world.size / 2);
    this.addUnit(
      createBeastEntity({
        role: 'boar',
        faction: 'neutral',
        position: {
          x: this.world.playerSpawn.x + 11,
          z: this.world.playerSpawn.z - 7,
        },
      }),
    );
    this.addUnit(
      createBeastEntity({
        role: 'mammoth',
        faction: 'neutral',
        position: { x: mid + 4, z: mid - 4 },
      }),
    );

    this.selectionBar.setPopupOpen(false);
    this.recomputeFogAndMeshes();
    this.tutorial.startIfFirstLevel(level.id);
  }

  private restoreFromSnapshot(snap: SavedBattleSnapshot): void {
    const lvl =
      CAMPAIGN_LEVELS.find((l) => l.id === snap.levelId) ??
      CAMPAIGN_LEVELS[0]!;
    const playerF = snap.factions.find((f) => f.faction === 'player');
    this.startLevel(lvl, playerF?.tribe ?? 'stonebacks');

    this.dayNight.setState(snap.dayNight);
    this.weather.setState(snap.weather);

    for (const oldBld of this.buildings.values()) {
      this.world.grid.setBuildingFootprint(
        oldBld.tile,
        oldBld.footprint,
        null,
      );
    }

    this.units.clear();
    this.buildings.clear();
    this.unitMeshes.clear();
    this.buildingMeshes.clear();
    this.entityGroup.clear();
    this.world.grid.spatialHash.clear();

    this.factions.clear();
    this.enemyAIs.length = 0;
    for (const f of snap.factions) {
      this.factions.set(f.faction, f);
      this.tribeByFaction.set(f.faction, f.tribe);
      if (f.faction.startsWith('enemy_')) {
        this.enemyAIs.push(
          new EnemyAIController({
            faction: f.faction,
            difficulty: lvl.enemyDifficulty,
            nightAttacks: lvl.enemyNightAttacks,
            baseWalks: lvl.enemyBaseWalks,
          }),
        );
      }
    }

    this.world.resources.deserialize(snap.resources, this.world.grid);
    for (const b of snap.buildings) {
      this.addBuilding(b);
    }
    for (const u of snap.units) {
      this.addUnit(u);
    }

    const restoredBase = this.findPlayerBuilding('base');
    this.commandResolver.setSelectedIds(
      restoredBase ? [restoredBase.id] : [],
    );
    if (restoredBase) {
      this.cameraRig.jumpTo(restoredBase.position);
    }
    this.selectionBar.setPopupOpen(false);
    this.selectionBar.invalidate();
    this.recomputeFogAndMeshes();
    this.refreshSelectionUI();
  }

  private createInitialFactionState(
    faction: FactionId,
    tribe: TribeId,
  ): FactionState {
    const startingResources =
      faction === 'player'
        ? BALANCE.PLAYER_ECONOMY.STARTING_RESOURCES
        : BALANCE.ENEMY_ECONOMY.STARTING_RESOURCES;

    return {
      faction,
      tribe,
      resources: { ...startingResources },
      storageCaps: { ...BALANCE.BASE_STORAGE_CAP },
      populationUsed: 0,
      populationCap: 20,
      workerPriorities: { food: 4, wood: 4, stone: 3, hide: 2, bronze: 1 },
      researchedTechs: [],
      activeResearch: null,
      unitWeaponTiers: {
        worker: 0,
        clubber: 0,
        spearman: 0,
        shield_bearer: 0,
        slinger: 0,
        bow_hunter: 0,
        scout: 0,
        shaman: 0,
      },
      unitArmorTiers: {
        worker: 0,
        clubber: 0,
        spearman: 0,
        shield_bearer: 0,
        slinger: 0,
        bow_hunter: 0,
        scout: 0,
        shaman: 0,
      },
      unlockedWeaponTier: 0,
      unlockedArmorTier: 0,
      powerCooldowns: {
        healing_rain: 0,
        rally_roar: 0,
        fire_rain: 0,
        earthquake: 0,
      },
      alarmActive: false,
      alarmPosition: null,
      alarmTimer: 0,
      unitsLost: 0,
      enemiesDefeated: 0,
    };
  }

  private spawnPlayerStartCamp(sp: Vec2, tribe: TribeId): void {
    const baseTile = {
      tx: Math.floor(sp.x) - 2,
      tz: Math.floor(sp.z) - 2,
    };
    const playerBase = createBaseEntity({
      faction: 'player',
      tribe,
      tile: baseTile,
    });
    this.addBuilding(playerBase);

    this.addBuilding(
      createBuildingEntity({
        buildingType: 'hut',
        faction: 'player',
        tribe,
        tile: { tx: baseTile.tx - 4, tz: baseTile.tz },
        isConstructed: true,
      }),
    );
    this.addBuilding(
      createBuildingEntity({
        buildingType: 'barracks',
        faction: 'player',
        tribe,
        tile: { tx: baseTile.tx + 5, tz: baseTile.tz - 1 },
        isConstructed: true,
      }),
    );
    this.addBuilding(
      createBuildingEntity({
        buildingType: 'weapon_station',
        faction: 'player',
        tribe,
        tile: { tx: baseTile.tx - 4, tz: baseTile.tz + 4 },
        isConstructed: true,
      }),
    );

    for (let i = 0; i < 4; i++) {
      this.addUnit(
        createWorkerEntity({
          faction: 'player',
          position: { x: sp.x - 2 + i * 1.4, z: sp.z + 4.5 },
        }),
      );
    }
    this.addUnit(
      createSoldierEntity({
        role: 'clubber',
        faction: 'player',
        position: { x: sp.x + 5, z: sp.z + 3 },
      }),
    );
    this.addUnit(
      createSoldierEntity({
        role: 'spearman',
        faction: 'player',
        position: { x: sp.x + 6.5, z: sp.z + 3 },
      }),
    );
    this.addUnit(
      createSoldierEntity({
        role: 'slinger',
        faction: 'player',
        position: { x: sp.x + 5.5, z: sp.z + 1.5 },
      }),
    );
    this.addUnit(
      createMachineEntity({
        role: 'raider_cart',
        faction: 'player',
        position: { x: sp.x + 3.5, z: sp.z - 4.5 },
      }),
    );
    this.addUnit(
      createHeroEntity({
        faction: 'player',
        tribe,
        position: { x: sp.x - 2.5, z: sp.z - 2.5 },
      }),
    );

    this.commandResolver.setSelectedIds([playerBase.id]);
  }

  private spawnEnemyCamp(
    enemyPos: Vec2,
    faction: FactionId,
    tribe: TribeId,
    levelId: number,
  ): void {
    const bt = {
      tx: Math.floor(enemyPos.x) - 2,
      tz: Math.floor(enemyPos.z) - 2,
    };
    this.addBuilding(
      createBaseEntity({
        faction,
        tribe,
        tile: bt,
        level: levelId >= 6 ? 2 : 1,
      }),
    );
    this.addBuilding(
      createBuildingEntity({
        buildingType: 'barracks',
        faction,
        tribe,
        tile: { tx: bt.tx - 4, tz: bt.tz },
        isConstructed: true,
      }),
    );
    for (let i = 0; i < 3; i++) {
      this.addUnit(
        createWorkerEntity({
          faction,
          position: { x: enemyPos.x - 2 + i * 1.5, z: enemyPos.z + 4 },
        }),
      );
    }
    this.addUnit(
      createSoldierEntity({
        role: 'clubber',
        faction,
        position: { x: enemyPos.x - 4, z: enemyPos.z - 3 },
      }),
    );
    this.addUnit(
      createSoldierEntity({
        role: 'slinger',
        faction,
        position: { x: enemyPos.x - 5.5, z: enemyPos.z - 3 },
      }),
    );
    if (levelId >= 7) {
      this.addUnit(
        createMachineEntity({
          role: 'titan_walker',
          faction,
          position: { x: enemyPos.x - 6, z: enemyPos.z - 6 },
        }),
      );
    }
  }

  private bindBusEvents(): void {
    this.bus.on('unit:died', ({ unitId }) => {
      const unit = this.units.get(unitId);
      if (unit) {
        this.effects.spawnFloatingText(
          '☠',
          unit.position,
          '#ff4d40',
          this.world.heightMap,
        );
      }
      if (unit && unit.kind === 'hero') {
        return;
      }
      const mesh = this.unitMeshes.get(unitId);
      if (mesh) {
        this.entityGroup.remove(mesh);
        this.unitMeshes.delete(unitId);
      }
      this.world.grid.spatialHash.remove(unitId);
      this.units.delete(unitId);
    });

    this.bus.on('alarm:triggered', ({ faction, position }) => {
      if (faction === 'player') {
        this.sfx.playAlarmHorn();
        this.haptics.alarm();
        this.minimap.triggerAlarmPing(position);
      }
    });

    this.bus.on('level:ended', ({ won, stars, levelId }) => {
      if (this.levelEnded) return;
      this.levelEnded = true;
      if (won && levelId > 0 && stars !== 0) {
        this.saveSystem.recordLevelStars(levelId, stars);
      }
      const playerState = this.factions.get('player')!;
      this.menus.showEndScreen({
        won,
        stars,
        levelName: this.currentLevel.name,
        elapsedSec: this.loop.getElapsedTime(),
        unitsLost: playerState.unitsLost,
        enemiesDefeated: playerState.enemiesDefeated,
        onContinue: () => {
          const progress = this.saveSystem.loadProgress();
          this.levelSelect.show(progress.starsByLevel);
        },
        onRestart: () => {
          this.restartCurrentLevel();
        },
      });
    });
  }

  private findPlayerHero(): UnitEntity | null {
    for (const u of this.units.values()) {
      if (u.faction === 'player' && u.kind === 'hero') {
        return u;
      }
    }
    return null;
  }

  private findPlayerBuilding(bType: BuildingType): BuildingEntity | null {
    for (const b of this.buildings.values()) {
      if (b.hp > 0 && b.faction === 'player' && b.buildingType === bType) {
        return b;
      }
    }
    return null;
  }

  /**
   * Smart Worker Assignment:
   * Prefers idle or resource-gathering workers and NEVER steals a worker that is
   * already constructing another unfinished building (unless all workers are building).
   */
  private assignNearestIdleWorkerToBuild(bld: BuildingEntity): void {
    let bestWorker: UnitEntity | null = null;
    let bestScore = Infinity;

    for (const u of this.units.values()) {
      if (u.faction !== 'player' || u.role !== 'worker' || u.hp <= 0) {
        continue;
      }
      const dist = Math.hypot(
        u.position.x - bld.position.x,
        u.position.z - bld.position.z,
      );
      // Penalize workers currently building another unfinished structure so we don't interrupt them
      const busyPenalty =
        u.jobMemory.jobType === 'build'
          ? 1000
          : u.jobMemory.jobType === 'gather'
            ? 15
            : 0;
      const score = dist + busyPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestWorker = u;
      }
    }

    if (bestWorker && bestWorker.jobMemory.jobType !== 'build') {
      bestWorker.targetEntityId = null;
      bestWorker.jobMemory = {
        jobType: 'build',
        targetEntityId: bld.id,
        resourceType:
          bestWorker.jobMemory.resourceType ?? bestWorker.carryResourceType,
        targetPosition: { ...bld.position },
      };
      bestWorker.status = 'working';
      bestWorker.path = Pathfinder.findPath(
        this.world.grid,
        bestWorker.position,
        bld.position,
        {
          footprint: 1,
          ignoreEntityId: bld.id,
        },
      );
    }
  }

  private updateGhostPreview(): void {
    if (!this.pendingBuildType) {
      this.effects.updatePlacementGhost(
        false,
        { x: 0, z: 0 },
        1,
        true,
        this.world.heightMap,
      );
      return;
    }
    const fp = BUILDINGS[this.pendingBuildType].footprint;
    const valid = this.world.grid.canPlaceBuilding(
      this.pendingBuildTile.tx,
      this.pendingBuildTile.tz,
      fp,
    );
    const centerPos: Vec2 = {
      x: this.pendingBuildTile.tx + fp * 0.5,
      z: this.pendingBuildTile.tz + fp * 0.5,
    };
    this.effects.updatePlacementGhost(
      true,
      centerPos,
      fp,
      valid,
      this.world.heightMap,
    );
    this.buildSheet.updatePlacementValidity(valid);
  }

  private rebuildPlayerUnitMeshes(): void {
    const playerState = this.factions.get('player')!;
    for (const unit of this.units.values()) {
      if (unit.faction !== 'player' || unit.kind !== 'unit') continue;
      const oldMesh = this.unitMeshes.get(unit.id);
      if (oldMesh) this.entityGroup.remove(oldMesh);
      const role = unit.role as keyof typeof playerState.unitWeaponTiers;
      const newMesh = this.modelFactory.createUnitMesh(
        unit,
        playerState.unitWeaponTiers[role] ?? 0,
        playerState.unitArmorTiers[role] ?? 0,
        this.settings.get().colorblindMode,
        this.settings.get().resolvedQuality !== 'high',
      );
      this.entityGroup.add(newMesh);
      this.unitMeshes.set(unit.id, newMesh);
    }
  }

  private addBuilding(bld: BuildingEntity): void {
    this.buildings.set(bld.id, bld);
    this.world.grid.setBuildingFootprint(bld.tile, bld.footprint, bld.id);
    const mesh = this.modelFactory.createBuildingMesh(
      bld,
      this.settings.get().colorblindMode,
    );
    const h = this.world.heightMap.getInterpolatedHeight(
      bld.position.x,
      bld.position.z,
    );
    mesh.position.set(bld.position.x, h, bld.position.z);
    this.entityGroup.add(mesh);
    this.buildingMeshes.set(bld.id, mesh);
  }

  private addUnit(unit: UnitEntity): void {
    this.units.set(unit.id, unit);
    this.world.grid.spatialHash.upsert(unit.id, unit.position);
    const fState = this.factions.get(unit.faction);
    const role = unit.role as keyof FactionState['unitWeaponTiers'];
    const wTier = fState?.unitWeaponTiers[role] ?? 0;
    const aTier = fState?.unitArmorTiers[role] ?? 0;
    const mesh = this.modelFactory.createUnitMesh(
      unit,
      wTier,
      aTier,
      this.settings.get().colorblindMode,
      this.settings.get().resolvedQuality !== 'high',
    );
    const h = this.world.heightMap.getInterpolatedHeight(
      unit.position.x,
      unit.position.z,
    );
    mesh.position.set(unit.position.x, h, unit.position.z);
    this.entityGroup.add(mesh);
    this.unitMeshes.set(unit.id, mesh);
  }

  private getCommandContext() {
    return {
      units: this.units,
      buildings: this.buildings,
      resources: this.world.resources.getAllNodes(),
      grid: this.world.grid,
      playerTribe: this.factions.get('player')!.tribe,
    };
  }

  private handlePointerInteraction(
    worldPos: Vec2,
    additive: boolean,
    isTouch: boolean,
  ): void {
    this.sfx.playTap();
    this.haptics.tap();

    const aimingPower = this.powerBar.getAimingPower();
    if (aimingPower) {
      this.powerBar.setAimingPower(null);
      if (
        PowersSystem.castSpiritPower(
          aimingPower,
          worldPos,
          this.factions.get('player')!,
          this.units,
          this.buildings,
          this.factions,
          this.activePowerZones,
          this.world.grid,
          this.bus,
        )
      ) {
        this.sfx.playPowerCast();
        this.haptics.powerCast();
      }
      return;
    }

    if (this.pendingBuildType) {
      const fp = BUILDINGS[this.pendingBuildType].footprint;
      const desiredTx = Math.round(worldPos.x - fp * 0.5);
      const desiredTz = Math.round(worldPos.z - fp * 0.5);
      this.pendingBuildTile = this.world.grid.findNearestValidBuildTile(
        desiredTx,
        desiredTz,
        fp,
        4,
      );
      this.updateGhostPreview();
      return;
    }

    if (this.relocateCampPending) {
      const selectedBlds: BuildingEntity[] = [];
      for (const id of this.commandResolver.getSelectedIds()) {
        const b = this.buildings.get(id);
        if (b && b.faction === 'player') selectedBlds.push(b);
      }
      MovementSystem.relocateBuildingGroup(
        selectedBlds,
        worldPos,
        this.world.grid,
      );
      this.relocateCampPending = false;
      this.selectionBar.setTravelEstimate('Camp relocating in formation...');
      this.selectionBar.invalidate();
      this.refreshSelectionUI();
      return;
    }

    const ctx = this.getCommandContext();
    const hits = this.commandResolver.findEntitiesNearPoint(worldPos, ctx);

    if (hits.length > 0) {
      const pickedId = hits[0]!.id;
      const bld = this.buildings.get(pickedId);
      const unit = this.units.get(pickedId);
      const isPlayerOwned =
        (bld && bld.faction === 'player') ||
        (unit && unit.faction === 'player');

      if (
        bld &&
        bld.faction === 'player' &&
        (!bld.isConstructed || bld.hp < bld.maxHp) &&
        this.commandResolver.hasSelectedPlayerWorkers(ctx)
      ) {
        this.handleCommandPoint(worldPos);
        this.notifications.pushToast(
          `🔨 Worker assigned to ${!bld.isConstructed ? 'finish building' : 'repair'} ${BUILDINGS[bld.buildingType].name}!`,
          'info',
        );
        return;
      }

      if (isPlayerOwned) {
        if (additive) {
          const cur = new Set(this.commandResolver.getSelectedIds());
          if (cur.has(pickedId)) cur.delete(pickedId);
          else cur.add(pickedId);
          this.commandResolver.setSelectedIds(Array.from(cur));
        } else {
          this.commandResolver.setSelectedIds([pickedId]);
        }
        this.effects.clearPathPreview();
        this.selectionBar.setTravelEstimate(null);
        this.selectionBar.invalidate();
        this.refreshSelectionUI();
        return;
      }
    }

    if (
      isTouch &&
      this.commandResolver.hasSelectedUnitsOrMovingBuilding(ctx)
    ) {
      this.handleCommandPoint(worldPos);
      return;
    }

    const firstId = this.commandResolver.getSelectedIds()[0];
    const firstBld = firstId ? this.buildings.get(firstId) : undefined;
    if (firstBld && firstBld.faction === 'player' && firstBld.mode === 'move') {
      this.handleCommandPoint(worldPos);
      return;
    }

    if (!isTouch && hits.length === 0) {
      this.commandResolver.clearSelection();
      this.selectionBar.setPopupOpen(false);
      this.effects.clearPathPreview();
      this.refreshSelectionUI();
    }
  }

  private handleCommandPoint(worldPos: Vec2): void {
    if (this.relocateCampPending) {
      const selectedBlds: BuildingEntity[] = [];
      for (const id of this.commandResolver.getSelectedIds()) {
        const b = this.buildings.get(id);
        if (b && b.faction === 'player') selectedBlds.push(b);
      }
      MovementSystem.relocateBuildingGroup(
        selectedBlds,
        worldPos,
        this.world.grid,
      );
      this.relocateCampPending = false;
      this.selectionBar.setTravelEstimate('Camp relocating in formation...');
      this.selectionBar.invalidate();
      this.refreshSelectionUI();
      return;
    }

    const preview = this.commandResolver.issueContextCommand(
      worldPos,
      this.getCommandContext(),
    );
    if (preview) {
      this.effects.showPathPreview(
        preview.path,
        preview.isBlocked,
        this.world.heightMap,
      );
      this.selectionBar.setTravelEstimate(
        preview.isBlocked
          ? 'Destination blocked — moving to nearest valid tile'
          : `Estimated travel time: ~${preview.estimatedSeconds}s`,
      );
    } else if (this.commandResolver.getSelectedIds().length > 0) {
      this.effects.showPathPreview([worldPos], false, this.world.heightMap);
    }
    this.refreshSelectionUI();
  }

  private refreshSelectionUI(): void {
    const rawIds = this.commandResolver.getSelectedIds();
    const validIds: EntityId[] = [];
    for (const id of rawIds) {
      const u = this.units.get(id);
      if (u && u.hp > 0 && !u.isReviving) {
        validIds.push(id);
        continue;
      }
      const b = this.buildings.get(id);
      if (b && b.hp > 0) {
        validIds.push(id);
      }
    }
    if (validIds.length !== rawIds.length) {
      this.commandResolver.setSelectedIds(validIds);
    }

    const hasSelection = validIds.length > 0;
    if (!hasSelection) {
      this.selectionBar.setPopupOpen(false);
    }

    const statsBtn = document.getElementById(
      'btn-order-stats',
    ) as HTMLButtonElement | null;
    const deselectBtn = document.getElementById(
      'btn-order-deselect',
    ) as HTMLButtonElement | null;
    const countBadge = document.getElementById(
      'badge-selected-count',
    ) as HTMLElement | null;
    const statsLabel = document.getElementById(
      'label-order-stats',
    ) as HTMLElement | null;

    if (statsBtn && deselectBtn) {
      statsBtn.style.display = hasSelection ? 'flex' : 'none';
      deselectBtn.style.display = hasSelection ? 'flex' : 'none';
      const isOpen = this.selectionBar.isPopupOpen();
      statsBtn.classList.toggle('sw-btn-primary', isOpen);
      statsBtn.classList.toggle('sw-btn-success', !isOpen);
      if (statsLabel) {
        statsLabel.textContent = isOpen ? 'Hide' : 'Stats';
      }
      if (countBadge) {
        countBadge.textContent = String(validIds.length);
        countBadge.style.display = validIds.length > 1 ? 'flex' : 'none';
      }
    }

    this.selectionBar.render(
      validIds,
      this.units,
      this.buildings,
      this.factions.get('player'),
    );

    const ringItems: Array<{ position: Vec2; radius: number }> = [];
    for (const id of validIds) {
      const u = this.units.get(id);
      if (u && u.hp > 0) {
        ringItems.push({
          position: u.position,
          radius: u.kind === 'machine' ? 1.6 : 0.95,
        });
      }
      const b = this.buildings.get(id);
      if (b && b.hp > 0) {
        ringItems.push({
          position: b.position,
          radius: b.footprint * 0.68,
        });
      }
    }
    this.effects.syncSelectionRings(ringItems, this.world.heightMap);
  }

  private recomputeFogAndMeshes(): void {
    if (!this.terrainRenderer) return;
    const relicVisionMult = this.world.relics.getBonusMultiplier(
      'player',
      'vision',
    );
    const emitters: VisionEmitter[] = [];
    for (const b of this.buildings.values()) {
      if (b.faction === 'player' && b.hp > 0) {
        emitters.push({
          position: b.position,
          visionRadius: BUILDINGS[b.buildingType].vision * relicVisionMult,
          isBuildingOrBase: true,
        });
      }
    }
    for (const u of this.units.values()) {
      if (u.faction === 'player' && u.hp > 0) {
        emitters.push({
          position: u.position,
          visionRadius: 12 * relicVisionMult,
          isBuildingOrBase: false,
        });
      }
    }
    this.fog.recompute(
      emitters,
      this.dayNight.getVisionMultiplier(),
      this.weather.getVisionMultiplier(),
      this.dayNight.getIsNight(),
    );
    this.terrainRenderer.applyFogShading(this.fog);
    this.terrainRenderer.syncResourceInstancedMeshes(
      this.world.resources.getAllNodes(),
      this.fog,
    );
  }

  private performSave(
    slot: SaveSlotIndex | 'auto' | 'manual' = this.saveSystem.getActiveSlot(),
  ): void {
    this.saveSystem.saveBattle(
      {
        version: CONFIG.SAVE_VERSION,
        timestamp: Date.now(),
        levelId: this.currentLevel.id,
        seed: this.world.seedUsed,
        elapsedTimeSec: this.loop.getElapsedTime(),
        dayNight: this.dayNight.getState(),
        weather: this.weather.getState(),
        factions: Array.from(this.factions.values()),
        units: Array.from(this.units.values()),
        buildings: Array.from(this.buildings.values()),
        resources: this.world.resources.serialize(),
      },
      slot,
    );
  }

  private onSimulate(dt: number): void {
    this.dayNight.update(dt);
    this.weather.update(dt, this.rng);

    const playerState = this.factions.get('player')!;
    const activeDifficulty = this.currentLevel.enemyDifficulty;
    const aiGatherMult =
      BALANCE.AI_DIFFICULTY[activeDifficulty].gatherMultiplier;

    for (const fState of this.factions.values()) {
      HousingSystem.recomputeCaps(
        fState,
        this.buildings.values(),
        this.units.values(),
      );
      const starv = HousingSystem.updateUpkeep(
        fState,
        this.units.values(),
        this.bus,
        dt,
      );
      const effectivePassiveDt =
        fState.faction === 'player' ? dt : dt * aiGatherMult;
      GatheringSystem.updatePassiveBuildingYields(
        fState,
        this.buildings.values(),
        effectivePassiveDt,
      );
      TechSystem.update(
        fState,
        this.buildings.values(),
        starv,
        this.bus,
        dt,
      );
      AlarmResponseSystem.update(
        fState,
        this.units.values(),
        this.buildings.values(),
        this.world.grid,
        this.bus,
        dt,
      );
    }

    ProductionSystem.updateBuildings(
      this.buildings.values(),
      this.factions,
      this.world.grid,
      1.0,
      this.bus,
      dt,
      (spawned) => this.addUnit(spawned),
    );

    SpawnerSystem.update(this.units, this.world.grid, dt, (crawler) =>
      this.addUnit(crawler),
    );

    BeastTamingSystem.update(
      this.units,
      this.buildings.values(),
      this.factions,
      this.bus,
      dt,
    );

    PowersSystem.update(
      this.factions,
      this.units,
      this.buildings,
      this.activePowerZones,
      this.bus,
      dt,
    );

    IdleBehaviorSystem.update(
      this.units.values(),
      this.buildings.values(),
      this.factions,
      this.world.resources,
      this.world.grid,
      dt,
    );

    const relicGatherMap = new Map<string, number>([
      [
        'player',
        this.world.relics.getBonusMultiplier('player', 'gather_speed'),
      ],
      ['enemy_1', aiGatherMult],
      ['enemy_2', aiGatherMult],
      ['enemy_3', aiGatherMult],
    ]);
    WorkerAI.update(
      this.units.values(),
      this.buildings,
      this.factions,
      this.world.resources,
      this.world.grid,
      relicGatherMap,
      this.bus,
      dt,
    );

    SoldierAI.update(
      this.units,
      this.buildings,
      this.dayNight.getVisionMultiplier() * this.weather.getVisionMultiplier(),
    );

    const playerBase = this.findPlayerBuilding('base');
    for (const ai of this.enemyAIs) {
      const fState = this.factions.get(ai.faction);
      if (fState) {
        ai.update(
          fState,
          this.units,
          this.buildings,
          playerBase ? playerBase.position : null,
          this.dayNight.getIsNight(),
          this.world.grid,
          this.bus,
          dt,
          (newEnemyBld) => this.addBuilding(newEnemyBld),
        );
      }
    }

    CombatSystem.update(
      this.units,
      this.buildings,
      this.projectiles,
      this.factions,
      this.world.grid,
      this.weather.getFireDamageMultiplier(),
      this.bus,
      dt,
    );

    const weatherSpeed = this.weather.getSpeedMultiplier();
    MovementSystem.updateUnits(
      this.units.values(),
      this.world.grid,
      weatherSpeed,
      dt,
    );

    let treesCrushed = 0;
    MovementSystem.updateWalkingBuildings(
      this.buildings.values(),
      this.units.values(),
      this.world.grid,
      this.tribeByFaction,
      weatherSpeed,
      dt,
      (base) => {
        const fState = this.factions.get(base.faction) ?? playerState;
        const stomp = StompSystem.applyBaseStomp(
          base,
          this.units.values(),
          this.buildings.values(),
          fState,
          this.world.grid,
          this.world.resources,
          this.bus,
          dt,
        );
        if (stomp.treesCrushed > 0) {
          this.effects.spawnFloatingText(
            `+${stomp.woodGained} Wood`,
            base.position,
            '#6f9c4a',
            this.world.heightMap,
          );
        }
        treesCrushed += stomp.treesCrushed;
        this.dustStepAccumulator += dt;
        if (this.dustStepAccumulator >= 0.35) {
          this.dustStepAccumulator = 0;
          this.effects.spawnDustPuff(base.position, this.world.heightMap);
          this.cameraRig.triggerShake(0.16, 0.12);
          this.sfx.playStomp();
        }
      },
    );

    for (const [bldId, bld] of this.buildings.entries()) {
      if (bld.hp <= 0 && bld.buildingType !== 'base') {
        this.world.grid.setBuildingFootprint(bld.tile, bld.footprint, null);
        const mesh = this.buildingMeshes.get(bldId);
        if (mesh) {
          this.entityGroup.remove(mesh);
          this.buildingMeshes.delete(bldId);
        }
        this.effects.spawnFloatingText(
          '💥',
          bld.position,
          '#ff4d40',
          this.world.heightMap,
        );
        this.buildings.delete(bldId);
      }
    }

    const playerPositions: Vec2[] = [];
    for (const u of this.units.values()) {
      if (u.hp > 0 && u.faction === 'player') {
        playerPositions.push(u.position);
      }
    }
    this.world.relics.updateCaptureCheck(
      new Map([['player', playerPositions]]),
      this.bus,
    );

    if (!this.levelEnded && this.loop.getTickCount() % 20 === 0) {
      VictorySystem.checkAndEmitEndState(
        this.currentLevel,
        playerState,
        this.buildings.values(),
        this.loop.getElapsedTime(),
        this.bus,
      );
    }

    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_INTERVAL_SEC) {
      this.autosaveTimer = 0;
      this.performSave(this.saveSystem.getActiveSlot());
    }

    if (treesCrushed > 0 || this.loop.getTickCount() % 12 === 0) {
      this.recomputeFogAndMeshes();
    }
  }

  private onRender(frameDelta: number): void {
    this.desktopInput.update(frameDelta);
    this.cameraRig.update(frameDelta);
    this.effects.update(frameDelta, this.cameraRig.camera);

    const playerState = this.factions.get('player')!;
    const inCombat =
      playerState.alarmActive || this.projectiles.size > 0;
    this.ambient.setCombatActive(inCombat, frameDelta);
    this.ambient.update(frameDelta);

    const elapsedTime = this.loop.getElapsedTime();

    this.effects.syncProjectiles(
      this.projectiles.values(),
      this.world.heightMap,
    );
    this.effects.syncPowerZones(
      this.activePowerZones,
      this.world.heightMap,
      elapsedTime,
    );
    const beaconPositions: Vec2[] = [];
    for (const obj of this.currentLevel.objectives) {
      if (obj.targetPosition) {
        beaconPositions.push(obj.targetPosition);
      }
    }
    this.effects.syncLandmarks(
      this.world.relics.getAll(),
      beaconPositions,
      this.world.heightMap,
      elapsedTime,
    );

    if (!this.menus.isMainMenuVisible()) {
      this.effects.syncWorldHealthBars(
        this.units,
        this.buildings,
        this.commandResolver.getSelectedIds(),
        this.fog,
        this.world.heightMap,
        this.cameraRig.camera,
      );
    }

    let idleWorkerCount = 0;
    for (const [id, unit] of this.units.entries()) {
      if (
        unit.faction === 'player' &&
        unit.role === 'worker' &&
        unit.hp > 0 &&
        unit.status === 'idle'
      ) {
        idleWorkerCount++;
      }
      const mesh = this.unitMeshes.get(id);
      if (!mesh) continue;
      if (unit.isReviving || unit.hp <= 0) {
        mesh.visible = false;
        continue;
      }
      const h = this.world.heightMap.getInterpolatedHeight(
        unit.position.x,
        unit.position.z,
      );
      mesh.position.set(unit.position.x, h, unit.position.z);
      mesh.rotation.y = unit.rotation;
      mesh.visible =
        unit.faction === 'player' || this.fog.isPositionVisible(unit.position);

      if (mesh.visible) {
        this.modelFactory.animateUnitMesh(mesh, unit, elapsedTime);
      }
    }

    const idleBadge = document.getElementById('badge-idle-count');
    if (idleBadge) {
      idleBadge.textContent = String(idleWorkerCount);
      idleBadge.style.display = idleWorkerCount > 0 ? 'flex' : 'none';
    }

    this.powerBar.updateHeroButton(this.findPlayerHero(), playerState);

    for (const [id, bld] of this.buildings.entries()) {
      const mesh = this.buildingMeshes.get(id);
      if (!mesh) continue;
      if (bld.hp <= 0) {
        mesh.visible = false;
        continue;
      }
      const h = this.world.heightMap.getInterpolatedHeight(
        bld.position.x,
        bld.position.z,
      );
      mesh.position.set(bld.position.x, h, bld.position.z);
      mesh.visible =
        bld.faction === 'player' || this.fog.isPositionExplored(bld.position);
      this.modelFactory.animateStructureLegs(
        mesh,
        bld.mode === 'move' && bld.path.length > 0,
        elapsedTime,
      );
    }

    this.refreshSelectionUI();

    const lighting = this.dayNight.getLighting();
    const target = this.cameraRig.getTarget();
    this.sceneSetup.applyDayNightLighting(lighting, target.x, target.z);

    const objStatus = VictorySystem.evaluateObjectives(
      this.currentLevel,
      playerState,
      this.buildings.values(),
      elapsedTime,
    );

    const aiStateSummary =
      this.enemyAIs.map((ai) => ai.getStateName()).join(', ') || 'None';
    this.hud.update(
      playerState,
      lighting,
      this.weather.getWeather(),
      `Lv.${this.currentLevel.id || 'Skirmish'}: ${this.currentLevel.name}`,
      objStatus.progressList,
      {
        fps: this.loop.getFps(),
        entityCount: this.units.size + this.buildings.size,
        aiState: aiStateSummary,
        seed: this.world.seedUsed,
      },
    );

    const blips: MinimapBlip[] = [];
    for (const b of this.buildings.values()) {
      if (b.hp > 0) {
        blips.push({
          position: b.position,
          faction: b.faction,
          isBaseOrBuilding: true,
        });
      }
    }
    for (const u of this.units.values()) {
      if (u.hp > 0 && !u.isReviving) {
        blips.push({
          position: u.position,
          faction: u.faction,
          isBaseOrBuilding: false,
        });
      }
    }
    this.minimap.render(
      this.world.heightMap,
      this.fog,
      blips,
      target,
      frameDelta,
    );

    this.sceneSetup.renderer.render(
      this.sceneSetup.scene,
      this.cameraRig.camera,
    );
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new StonewalkerGame();

  if (
    'serviceWorker' in navigator &&
    window.location.protocol === 'https:'
  ) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});