/**
 * STONEWALKER — Visual Effects, World-Space Health Bars, Projectiles & Command Rings
 * Adds Clash of Clans / Command & Conquer style floating health bars and role/rank badges
 * above damaged or selected units and buildings.
 */

import * as THREE from 'three';
import type { SettingsManager } from '../core/Settings';
import type {
  BuildingEntity,
  EntityId,
  ProjectileEntity,
  RelicEntity,
  UnitEntity,
  Vec2,
} from '../data/types';
import type { ActivePowerZone } from '../systems/Powers';
import type { FogOfWar } from '../world/Fog';
import type { HeightMap } from '../world/HeightMap';

interface DustParticle {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
}

interface FloatingTextItem {
  el: HTMLElement;
  worldPos: Vec2;
  worldY: number;
  life: number;
  maxLife: number;
}

export class EffectsManager {
  public readonly root = new THREE.Group();
  private readonly selectionGroup = new THREE.Group();
  private readonly pathPreviewGroup = new THREE.Group();
  private readonly projectileGroup = new THREE.Group();
  private readonly powerZoneGroup = new THREE.Group();
  private readonly landmarkGroup = new THREE.Group();
  private readonly ghostMesh: THREE.Mesh;
  private readonly dustPool: DustParticle[] = [];
  private readonly floatingTexts: FloatingTextItem[] = [];
  private readonly hpBarElements = new Map<EntityId, HTMLElement>();

  private readonly ringGeo = new THREE.RingGeometry(0.62, 0.86, 28);
  private readonly ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    side: THREE.DoubleSide,
  });
  private readonly pathDotGeo = new THREE.SphereGeometry(0.2, 8, 8);
  private readonly pathDotValidMat = new THREE.MeshBasicMaterial({
    color: 0x7cd43b,
  });
  private readonly pathDotBlockedMat = new THREE.MeshBasicMaterial({
    color: 0xff4d40,
  });

  private readonly projGeo = new THREE.DodecahedronGeometry(0.24, 0);
  private readonly projPierceMat = new THREE.MeshBasicMaterial({
    color: 0xfff3d1,
  });
  private readonly projSiegeMat = new THREE.MeshBasicMaterial({
    color: 0x9ca3af,
  });
  private readonly projFireMat = new THREE.MeshBasicMaterial({
    color: 0xff6b22,
  });

  private readonly settings: SettingsManager;

  public constructor(settings: SettingsManager) {
    this.settings = settings;
    this.ringGeo.rotateX(-Math.PI / 2);

    this.ghostMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.55, 1),
      new THREE.MeshBasicMaterial({
        color: 0x6f9c4a,
        transparent: true,
        opacity: 0.48,
      }),
    );
    this.ghostMesh.visible = false;

    this.root.add(
      this.selectionGroup,
      this.pathPreviewGroup,
      this.projectileGroup,
      this.powerZoneGroup,
      this.landmarkGroup,
      this.ghostMesh,
    );
  }

  public syncSelectionRings(
    selectedItems: ReadonlyArray<{ position: Vec2; radius: number }>,
    heightMap: HeightMap,
  ): void {
    this.selectionGroup.clear();
    for (const item of selectedItems) {
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
      const h = heightMap.getInterpolatedHeight(
        item.position.x,
        item.position.z,
      );
      ring.position.set(item.position.x, h + 0.09, item.position.z);
      ring.scale.setScalar(item.radius);
      this.selectionGroup.add(ring);
    }
  }

  /**
   * Renders Clash of Clans / C&C style world-space health bars above damaged or selected entities.
   */
  public syncWorldHealthBars(
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    selectedIds: readonly EntityId[],
    fog: FogOfWar,
    heightMap: HeightMap,
    camera: THREE.Camera,
  ): void {
    const overlay = document.getElementById('damage-overlay');
    if (!overlay) return;

    const selectedSet = new Set(selectedIds);
    const activeIds = new Set<EntityId>();
    const projVec = new THREE.Vector3();

    const updateBar = (
      id: EntityId,
      pos: Vec2,
      yOffset: number,
      hp: number,
      maxHp: number,
      isPlayer: boolean,
      badgeText: string,
      widthPx: number,
    ): void => {
      activeIds.add(id);
      let el = this.hpBarElements.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'world-hp-plate';
        el.innerHTML = `
          <div class="world-hp-label"></div>
          <div class="world-hp-track"><div class="world-hp-fill"></div></div>
        `;
        overlay.appendChild(el);
        this.hpBarElements.set(id, el);
      }

      const h = heightMap.getInterpolatedHeight(pos.x, pos.z);
      projVec.set(pos.x, h + yOffset, pos.z);
      projVec.project(camera);

      if (projVec.z > 1) {
        el.style.display = 'none';
        return;
      }

      const sx = (projVec.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-projVec.y * 0.5 + 0.5) * window.innerHeight;
      el.style.display = 'flex';
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;

      const track = el.querySelector('.world-hp-track') as HTMLElement | null;
      const fill = el.querySelector('.world-hp-fill') as HTMLElement | null;
      const label = el.querySelector('.world-hp-label') as HTMLElement | null;

      if (track) {
        track.style.width = `${widthPx}px`;
      }
      if (fill) {
        const pct = Math.max(0, Math.min(100, Math.round((hp / Math.max(1, maxHp)) * 100)));
        fill.style.width = `${pct}%`;
        fill.style.background = isPlayer
          ? pct > 45
            ? '#52d669'
            : '#f59e0b'
          : '#ff4d40';
      }
      if (label) {
        label.textContent = badgeText;
      }
    };

    for (const u of units.values()) {
      if (u.hp <= 0 || u.isReviving) continue;
      const isSelected = selectedSet.has(u.id);
      const isDamaged = u.hp < u.maxHp;
      if (!isSelected && !isDamaged && u.veterancyRank === 0 && u.kind !== 'hero') {
        continue;
      }
      if (u.faction !== 'player' && !fog.isPositionVisible(u.position)) {
        continue;
      }
      const stars = '★'.repeat(u.veterancyRank);
      const badge =
        u.kind === 'hero'
          ? `👑 ${stars}`
          : u.role === 'worker' && u.carryAmount > 0
            ? `🎒 ${Math.floor(u.carryAmount)}`
            : stars;
      const yOff = u.kind === 'machine' ? 2.2 : u.kind === 'hero' ? 2.1 : 1.55;
      updateBar(
        u.id,
        u.position,
        yOff,
        u.hp,
        u.maxHp,
        u.faction === 'player',
        badge,
        u.kind === 'machine' ? 46 : 34,
      );
    }

    for (const b of buildings.values()) {
      if (b.hp <= 0) continue;
      const isSelected = selectedSet.has(b.id);
      const isDamaged = b.hp < b.maxHp || !b.isConstructed;
      if (!isSelected && !isDamaged) continue;
      if (b.faction !== 'player' && !fog.isPositionExplored(b.position)) {
        continue;
      }
      const badge = !b.isConstructed
        ? `🔨 ${Math.round((b.constructionProgress / Math.max(1, b.constructionTotalTime)) * 100)}%`
        : b.mode === 'move'
          ? `🚶 WALKING`
          : `Lv.${b.level}`;
      const yOff = b.buildingType === 'base' ? 4.3 : 2.6;
      updateBar(
        b.id,
        b.position,
        yOff,
        b.hp,
        b.maxHp,
        b.faction === 'player',
        badge,
        b.buildingType === 'base' ? 68 : 50,
      );
    }

    for (const [id, el] of this.hpBarElements.entries()) {
      if (!activeIds.has(id)) {
        el.remove();
        this.hpBarElements.delete(id);
      }
    }
  }

  public showPathPreview(
    waypoints: readonly Vec2[],
    isBlocked: boolean,
    heightMap: HeightMap,
  ): void {
    this.pathPreviewGroup.clear();
    if (waypoints.length === 0) {
      return;
    }
    const mat = isBlocked ? this.pathDotBlockedMat : this.pathDotValidMat;

    for (let i = 0; i < waypoints.length; i++) {
      const pt = waypoints[i]!;
      const dot = new THREE.Mesh(this.pathDotGeo, mat);
      const h = heightMap.getInterpolatedHeight(pt.x, pt.z);
      dot.position.set(pt.x, h + 0.28, pt.z);
      this.pathPreviewGroup.add(dot);
    }
  }

  public clearPathPreview(): void {
    this.pathPreviewGroup.clear();
  }

  public updatePlacementGhost(
    visible: boolean,
    position: Vec2,
    footprint: number,
    isValid: boolean,
    heightMap: HeightMap,
  ): void {
    this.ghostMesh.visible = visible;
    if (!visible) {
      return;
    }
    const h = heightMap.getInterpolatedHeight(position.x, position.z);
    this.ghostMesh.position.set(position.x, h + 0.35, position.z);
    this.ghostMesh.scale.set(footprint, 1.4, footprint);
    const mat = this.ghostMesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(isValid ? 0x6f9c4a : 0xc4453a);
  }

  public syncProjectiles(
    projectiles: Iterable<ProjectileEntity>,
    heightMap: HeightMap,
  ): void {
    this.projectileGroup.clear();
    for (const p of projectiles) {
      const mat =
        p.damageType === 'fire' || p.causesFire
          ? this.projFireMat
          : p.damageType === 'siege'
            ? this.projSiegeMat
            : this.projPierceMat;
      const mesh = new THREE.Mesh(this.projGeo, mat);
      const h = heightMap.getInterpolatedHeight(p.position.x, p.position.z);
      const distRemaining = Math.hypot(
        p.targetPosition.x - p.position.x,
        p.targetPosition.z - p.position.z,
      );
      const arcBoost = Math.min(2.8, distRemaining * 0.22);
      mesh.position.set(p.position.x, h + 1.1 + arcBoost, p.position.z);
      if (p.damageType === 'siege' || p.causesFire) {
        mesh.scale.setScalar(1.45);
      }
      this.projectileGroup.add(mesh);
    }
  }

  public syncPowerZones(
    zones: readonly ActivePowerZone[],
    heightMap: HeightMap,
    elapsedTime: number,
  ): void {
    this.powerZoneGroup.clear();
    for (const z of zones) {
      const colorHex =
        z.powerId === 'healing_rain'
          ? 0x6f9c4a
          : z.powerId === 'rally_roar'
            ? 0xe2b04a
            : z.powerId === 'fire_rain'
              ? 0xff5522
              : 0xb58952;

      const discGeo = new THREE.CircleGeometry(z.radius, 28);
      discGeo.rotateX(-Math.PI / 2);
      const pulse = 0.24 + Math.sin(elapsedTime * 6) * 0.08;
      const discMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: pulse,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(discGeo, discMat);
      const h = heightMap.getInterpolatedHeight(z.position.x, z.position.z);
      mesh.position.set(z.position.x, h + 0.12, z.position.z);
      this.powerZoneGroup.add(mesh);
    }
  }

  public syncLandmarks(
    relics: readonly RelicEntity[],
    beaconPositions: readonly Vec2[],
    heightMap: HeightMap,
    elapsedTime: number,
  ): void {
    this.landmarkGroup.clear();

    for (const relic of relics) {
      const h = heightMap.getInterpolatedHeight(
        relic.position.x,
        relic.position.z,
      );
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65, 0),
        new THREE.MeshStandardMaterial({
          color: relic.capturedBy === 'player' ? 0x6f9c4a : 0xe2b04a,
          emissive: relic.capturedBy === 'player' ? 0x2d5a18 : 0x7a5411,
          roughness: 0.4,
          flatShading: true,
        }),
      );
      crystal.position.set(
        relic.position.x,
        h + 1.1 + Math.sin(elapsedTime * 3) * 0.15,
        relic.position.z,
      );
      crystal.rotation.y = elapsedTime * 1.2;
      this.landmarkGroup.add(crystal);
    }

    for (const beacon of beaconPositions) {
      const h = heightMap.getInterpolatedHeight(beacon.x, beacon.z);
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.9, 3.6, 6),
        new THREE.MeshStandardMaterial({
          color: 0xe2b04a,
          emissive: 0x996515,
          roughness: 0.5,
          flatShading: true,
        }),
      );
      pillar.position.set(beacon.x, h + 1.8, beacon.z);

      const ringGeo = new THREE.RingGeometry(4.5, 5.0, 28);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xe2b04a,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.set(beacon.x, h + 0.12, beacon.z);

      this.landmarkGroup.add(pillar, ring);
    }
  }

  public spawnFloatingText(
    text: string,
    worldPos: Vec2,
    color: string = '#ffcf70',
    heightMap: HeightMap,
  ): void {
    if (!this.settings.get().floatingDamageNumbers) {
      return;
    }
    const overlay = document.getElementById('damage-overlay');
    if (!overlay) {
      return;
    }
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
      position: absolute;
      font-weight: 900;
      font-size: 0.92rem;
      color: ${color};
      text-shadow: 0 2px 4px rgba(0,0,0,0.85);
      pointer-events: none;
      transform: translate(-50%, -50%);
    `;
    overlay.appendChild(el);
    this.floatingTexts.push({
      el,
      worldPos: { x: worldPos.x, z: worldPos.z },
      worldY: heightMap.getInterpolatedHeight(worldPos.x, worldPos.z) + 1.8,
      life: 0,
      maxLife: 0.95,
    });
  }

  public spawnDustPuff(position: Vec2, heightMap: HeightMap): void {
    if (
      this.settings.get().reducedMotion ||
      this.settings.get().resolvedQuality === 'low'
    ) {
      return;
    }
    const h = heightMap.getInterpolatedHeight(position.x, position.z);
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.32, 0),
      new THREE.MeshBasicMaterial({
        color: 0xc8b598,
        transparent: true,
        opacity: 0.7,
      }),
    );
    mesh.position.set(
      position.x + (Math.random() - 0.5) * 2.2,
      h + 0.25,
      position.z + (Math.random() - 0.5) * 2.2,
    );
    this.root.add(mesh);
    this.dustPool.push({
      mesh,
      life: 0,
      maxLife: 0.75,
      vx: (Math.random() - 0.5) * 1.4,
      vy: 0.9 + Math.random() * 0.6,
      vz: (Math.random() - 0.5) * 1.4,
    });
  }

  public update(dt: number, camera?: THREE.Camera): void {
    for (let i = this.dustPool.length - 1; i >= 0; i--) {
      const p = this.dustPool[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.root.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.dustPool.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const ratio = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(0.6 + (1 - ratio) * 1.2);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio * 0.65;
    }

    if (camera) {
      const projVec = new THREE.Vector3();
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const item = this.floatingTexts[i]!;
        item.life += dt;
        item.worldY += dt * 1.6;
        if (item.life >= item.maxLife) {
          item.el.remove();
          this.floatingTexts.splice(i, 1);
          continue;
        }
        projVec.set(item.worldPos.x, item.worldY, item.worldPos.z);
        projVec.project(camera);
        const sx = (projVec.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-projVec.y * 0.5 + 0.5) * window.innerHeight;
        item.el.style.left = `${sx}px`;
        item.el.style.top = `${sy}px`;
        item.el.style.opacity = String(1 - item.life / item.maxLife);
      }
    }
  }
}