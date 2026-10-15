/**
 * STONEWALKER — Shared TypeScript Interfaces & Schemas
 * Strictly typed, plain-data structures designed for full JSON serializability.
 */

export type EntityId = string;
export type FactionId = 'player' | 'enemy_1' | 'enemy_2' | 'enemy_3' | 'neutral';
export type TribeId = 'stonebacks' | 'reef_clan' | 'ember_tribe';
export type AgeId = 'stone' | 'bone' | 'bronze';

export type ResourceType = 'food' | 'wood' | 'stone' | 'hide' | 'bronze';

export interface Resources {
  food: number;
  wood: number;
  stone: number;
  hide: number;
  bronze: number;
}

export type TerrainTag =
  | 'ground'
  | 'high_ground'
  | 'forest'
  | 'swamp'
  | 'water'
  | 'cliff';

export type MapTheme =
  | 'green_valley'
  | 'ancient_forest'
  | 'misty_swamp'
  | 'arid_desert'
  | 'frost_peaks'
  | 'volcanic_crag'
  | 'river_crossings'
  | 'titan_plateau';

export type WeatherType = 'clear' | 'rain' | 'fog' | 'snow';

export type FogState = 0 | 1 | 2; // 0 = unknown, 1 = explored, 2 = visible

export type WeaponTier = 0 | 1 | 2 | 3; // 0: Wood, 1: Stone, 2: Bone, 3: Bronze
export type ArmorTier = 0 | 1 | 2 | 3; // 0: Hide, 1: Wood Plate, 2: Bone Plate, 3: Bronze Plate

export type DamageType = 'melee' | 'pierce' | 'siege' | 'fire' | 'stomp';
export type ArmorType = 'unarmored' | 'light' | 'heavy' | 'structure' | 'hero';

export type UnitRole =
  | 'worker'
  | 'clubber'
  | 'spearman'
  | 'shield_bearer'
  | 'slinger'
  | 'bow_hunter'
  | 'scout'
  | 'shaman';

export type MachineRole =
  | 'raider_cart'
  | 'boulder_thrower'
  | 'bone_ram'
  | 'shell_walker'
  | 'fire_catapult'
  | 'mammoth_fortress'
  | 'titan_walker'
  | 'crawler';

export type BeastRole = 'boar' | 'sabertooth' | 'mammoth';

export type BuildingType =
  | 'base'
  | 'hut'
  | 'forager_camp'
  | 'woodcutter_camp'
  | 'quarry'
  | 'tannery'
  | 'bronze_mine'
  | 'storage_pit'
  | 'barracks'
  | 'sling_range'
  | 'beast_pen'
  | 'machine_workshop'
  | 'weapon_station'
  | 'armory'
  | 'research_hall'
  | 'lookout'
  | 'spirit_totem';

export type SpiritPowerId =
  | 'healing_rain'
  | 'rally_roar'
  | 'fire_rain'
  | 'earthquake';

export type TechBranch = 'gathering' | 'building' | 'military' | 'machines';

export type WeaponStationItemType = 'spear' | 'club' | 'sling';

export type StructureMode = 'stand' | 'move';
export type UnitStance = 'aggressive' | 'hold_position';
export type UnitActivityStatus = 'working' | 'guarding' | 'idle' | 'fighting' | 'moving';

export interface Vec2 {
  x: number;
  z: number;
}

export interface TileCoord {
  tx: number;
  tz: number;
}

export interface UnitDefinition {
  id: UnitRole;
  name: string;
  description: string;
  strongVs: string;
  weakVs: string;
  maxHp: number;
  armorType: ArmorType;
  baseArmor: number;
  damageType: DamageType;
  baseDamage: number;
  attackRange: number;
  attackCooldown: number;
  speed: number;
  vision: number;
  cost: Partial<Resources>;
  trainTime: number;
  foodUpkeepPerMin: number;
  popCost: number;
  trainedAt: BuildingType;
  requiredTech?: string;
}

export interface MachineDefinition {
  id: MachineRole;
  name: string;
  description: string;
  strongVs: string;
  weakVs: string;
  maxHp: number;
  armorType: ArmorType;
  baseArmor: number;
  damageType: DamageType;
  baseDamage: number;
  attackRange: number;
  attackCooldown: number;
  speed: number;
  vision: number;
  footprint: number;
  cost: Partial<Resources>;
  trainTime: number;
  foodUpkeepPerMin: number;
  popCost: number;
  maxCount: number;
  spawnsCrawler: boolean;
  requiredTech?: string;
}

export interface BuildingDefinition {
  id: BuildingType;
  name: string;
  tooltip: string;
  footprint: number;
  maxHp: number;
  armor: number;
  vision: number;
  moveSpeed: number;
  moveModeHpMultiplier: number;
  cost: Partial<Resources>;
  buildTime: number;
  maxCountBase: number;
  housingProvided: number;
  storageBonus?: Partial<Resources>;
  isResourceDropOff?: ResourceType[];
  producesUnits?: (UnitRole | MachineRole)[];
  requiredBaseLevel?: number;
  requiredTech?: string;
  maxLevel: number;
}

export interface TechDefinition {
  id: string;
  name: string;
  age: AgeId;
  branch: TechBranch;
  description: string;
  cost: Partial<Resources>;
  researchTime: number;
  prerequisite?: string;
  effect: {
    type:
      | 'gather_speed'
      | 'carry_capacity'
      | 'unlock_building'
      | 'unlock_unit'
      | 'unlock_machine'
      | 'unlock_equipment_tier'
      | 'unlock_power'
      | 'base_upgrade'
      | 'building_hp'
      | 'building_cap';
    target?: string;
    value: number;
  };
}

export interface SpiritPowerDefinition {
  id: SpiritPowerId;
  name: string;
  description: string;
  cooldown: number;
  radius: number;
  duration: number;
  value: number;
  requiredTech?: string;
}

export interface HeroDefinition {
  id: string;
  tribe: TribeId;
  name: string;
  title: string;
  abilityName: string;
  abilityDescription: string;
  abilityCooldown: number;
  abilityRadius: number;
  maxHp: number;
  damage: number;
  armor: number;
  attackRange: number;
  speed: number;
  vision: number;
  reviveTime: number;
}

export interface WorkerJobMemory {
  jobType: 'gather' | 'build' | 'repair' | 'none';
  targetEntityId: EntityId | null;
  resourceType: ResourceType | null;
  targetPosition: Vec2 | null;
}

export interface ProductionQueueItem {
  itemType: UnitRole | MachineRole | WeaponStationItemType | string;
  progress: number;
  totalTime: number;
}

export interface UnitEntity {
  id: EntityId;
  kind: 'unit' | 'machine' | 'hero' | 'beast';
  role: UnitRole | MachineRole | BeastRole | 'chieftain';
  faction: FactionId;
  position: Vec2;
  rotation: number;
  hp: number;
  maxHp: number;
  shieldHp: number;
  speed: number;
  attackCooldownTimer: number;
  path: Vec2[];
  targetEntityId: EntityId | null;
  moveTarget: Vec2 | null;
  stance: UnitStance;
  status: UnitActivityStatus;
  idleTimer: number;
  veterancyKills: number;
  veterancyRank: 0 | 1 | 2 | 3;
  guardSpot: Vec2 | null;
  carryResourceType: ResourceType | null;
  carryAmount: number;
  jobMemory: WorkerJobMemory;
  equippedEmergencyWeapon: WeaponStationItemType | null;
  parentMachineId: EntityId | null;
  activeCrawlerIds: EntityId[];
  crawlerSpawnTimer: number;
  heroAbilityCooldownTimer: number;
  isReviving: boolean;
  reviveTimer: number;
}

export interface BuildingEntity {
  id: EntityId;
  kind: 'building';
  buildingType: BuildingType;
  faction: FactionId;
  tile: TileCoord;
  position: Vec2;
  footprint: number;
  hp: number;
  maxHp: number;
  level: number;
  isConstructed: boolean;
  constructionProgress: number;
  constructionTotalTime: number;
  mode: StructureMode;
  path: Vec2[];
  moveTarget: Vec2 | null;
  rallyPoint: Vec2;
  queue: ProductionQueueItem[];
  repeatQueue: boolean;
  fireBurnTimer: number;
  attackCooldownTimer: number;
  weaponStock: Record<WeaponStationItemType, number>;
}

export interface ResourceNodeEntity {
  id: EntityId;
  kind: 'resource';
  resourceType: ResourceType;
  position: Vec2;
  tile: TileCoord;
  amountRemaining: number;
  maxAmount: number;
}

export interface ProjectileEntity {
  id: EntityId;
  sourceId: EntityId;
  faction: FactionId;
  position: Vec2;
  targetPosition: Vec2;
  targetEntityId: EntityId | null;
  speed: number;
  damage: number;
  damageType: DamageType;
  splashRadius: number;
  causesFire: boolean;
}

export interface RelicEntity {
  id: EntityId;
  name: string;
  position: Vec2;
  bonusType: 'gather_speed' | 'vision' | 'attack_damage';
  bonusValue: number;
  capturedBy: FactionId | null;
}

export interface FactionState {
  faction: FactionId;
  tribe: TribeId;
  resources: Resources;
  storageCaps: Resources;
  populationUsed: number;
  populationCap: number;
  workerPriorities: Record<ResourceType, number>;
  researchedTechs: string[];
  activeResearch: ProductionQueueItem | null;
  unitWeaponTiers: Record<UnitRole, WeaponTier>;
  unitArmorTiers: Record<UnitRole, ArmorTier>;
  unlockedWeaponTier: WeaponTier;
  unlockedArmorTier: ArmorTier;
  powerCooldowns: Record<SpiritPowerId, number>;
  alarmActive: boolean;
  alarmPosition: Vec2 | null;
  alarmTimer: number;
  unitsLost: number;
  enemiesDefeated: number;
}

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'auto';

export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  graphicsQuality: GraphicsQuality;
  resolvedQuality: 'low' | 'medium' | 'high';
  hapticsEnabled: boolean;
  cameraSensitivity: number;
  uiScale: number;
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  colorblindMode: boolean;
  floatingDamageNumbers: boolean;
  language: 'en';
}

export interface LevelObjective {
  id: string;
  description: string;
  type:
    | 'destroy_enemy_base'
    | 'survive_time'
    | 'move_base_to_beacon'
    | 'gather_resources'
    | 'defeat_boss';
  targetValue: number;
  targetPosition?: Vec2;
  isBonus?: boolean;
}

export interface LevelDefinition {
  id: number;
  name: string;
  subtitle: string;
  storyIntro: string;
  size: number;
  seed: number;
  theme: MapTheme;
  weatherDefault: WeatherType;
  playerTribeDefault: TribeId;
  enemyCount: number;
  enemyDifficulty: 'easy' | 'normal' | 'hard';
  enemyNightAttacks: boolean;
  enemyBaseWalks: boolean;
  objectives: LevelObjective[];
  twoStarTimeLimitSec: number;
  twoStarMaxLosses: number;
  threeStarBonusText: string;
}

export interface GameEvents {
  'game:tick': { tickCount: number; dt: number; elapsedTime: number };
  'game:pauseChanged': { paused: boolean };
  'settings:changed': { settings: GameSettings };
  'quality:autoAdjusted': { newQuality: 'low' | 'medium' | 'high'; fps: number };
  'daynight:phaseChanged': { isNight: boolean; timeOfDay: number };
  'weather:changed': { weather: WeatherType };
  'alarm:triggered': { faction: FactionId; position: Vec2; buildingId: EntityId };
  'alarm:cleared': { faction: FactionId };
  'building:completed': { buildingId: EntityId; buildingType: BuildingType; faction: FactionId };
  'building:modeChanged': { buildingId: EntityId; mode: StructureMode };
  'unit:spawned': { unitId: EntityId; role: string; faction: FactionId };
  'unit:died': { unitId: EntityId; faction: FactionId };
  'power:cast': { powerId: SpiritPowerId; faction: FactionId; position: Vec2 };
  'ui:toast': { message: string; level: 'info' | 'warning' | 'danger' | 'success'; jumpTo?: Vec2 };
  'selection:changed': { selectedIds: EntityId[] };
  'level:ended': { won: boolean; stars: 0 | 1 | 2 | 3; levelId: number };
}