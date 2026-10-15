/**
 * STONEWALKER — Semi-Transparent Radar Minimap
 * Sits on the top-left of the Orders icon bar, visible by default (`collapsed = false`),
 * and toggles visible/hidden when clicking the Map icon in the Orders bar.
 */

import type { FactionId, TerrainTag, Vec2 } from '../data/types';
import type { FogOfWar } from '../world/Fog';
import type { HeightMap } from '../world/HeightMap';

export interface MinimapBlip {
  position: Vec2;
  faction: FactionId;
  isBaseOrBuilding: boolean;
}

const TAG_COLORS: Record<TerrainTag, [number, number, number]> = {
  ground: [118, 148, 76],
  high_ground: [158, 142, 102],
  forest: [68, 102, 48],
  swamp: [80, 96, 66],
  water: [56, 124, 162],
  cliff: [98, 88, 78],
};

export class Minimap {
  public readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onJumpCamera: (worldPos: Vec2) => void;

  private mapSize = 128;
  private collapsed = false; // Visible by default
  private isDragging = false;
  private alarmPingPos: Vec2 | null = null;
  private alarmPingTimer = 0;

  public constructor(
    parent: HTMLElement,
    mapSize: number,
    onJumpCamera: (worldPos: Vec2) => void,
  ) {
    this.mapSize = mapSize;
    this.onJumpCamera = onJumpCamera;

    this.container = document.createElement('aside');
    this.container.className = 'minimap-translucent';

    this.canvas = document.createElement('canvas');
    this.canvas.width = 122;
    this.canvas.height = 122;
    this.canvas.style.cssText =
      'width:122px;height:122px;border-radius:8px;cursor:pointer;touch-action:none;display:block;';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D context for Minimap');
    }
    this.ctx = ctx;

    this.container.appendChild(this.canvas);
    parent.prepend(this.container);

    this.setCollapsed(false);
    this.bindInput();
  }

  public isCollapsed(): boolean {
    return this.collapsed;
  }

  public setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.container.style.display = collapsed ? 'none' : 'flex';
  }

  public toggle(): boolean {
    this.setCollapsed(!this.collapsed);
    return !this.collapsed;
  }

  public triggerAlarmPing(pos: Vec2): void {
    this.alarmPingPos = { ...pos };
    this.alarmPingTimer = 4.0;
  }

  private bindInput(): void {
    const jumpFromEvent = (clientX: number, clientY: number): void => {
      const rect = this.canvas.getBoundingClientRect();
      const u = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      this.onJumpCamera({
        x: u * this.mapSize,
        z: v * this.mapSize,
      });
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.isDragging = true;
      jumpFromEvent(e.clientX, e.clientY);
    });

    window.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        jumpFromEvent(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });
  }

  public render(
    heightMap: HeightMap,
    fog: FogOfWar,
    blips: readonly MinimapBlip[],
    cameraTarget: Vec2,
    dt: number,
  ): void {
    if (this.collapsed) {
      return;
    }
    this.mapSize = heightMap.size;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const imgData = this.ctx.createImageData(w, h);
    const data = imgData.data;

    for (let py = 0; py < h; py++) {
      const tz = Math.min(
        this.mapSize - 1,
        Math.floor((py / h) * this.mapSize),
      );
      for (let px = 0; px < w; px++) {
        const tx = Math.min(
          this.mapSize - 1,
          Math.floor((px / w) * this.mapSize),
        );
        const fogState = fog.getState(tx, tz);
        const shade = fogState === 2 ? 1.0 : fogState === 1 ? 0.72 : 0.35;
        const rgb = TAG_COLORS[heightMap.getTag(tx, tz)];

        const idx = (py * w + px) * 4;
        data[idx] = Math.round(rgb[0] * shade);
        data[idx + 1] = Math.round(rgb[1] * shade);
        data[idx + 2] = Math.round(rgb[2] * shade);
        data[idx + 3] = 190; // Translucent radar alpha
      }
    }
    this.ctx.putImageData(imgData, 0, 0);

    for (const blip of blips) {
      const tx = Math.floor(blip.position.x);
      const tz = Math.floor(blip.position.z);
      if (blip.faction !== 'player' && fog.getState(tx, tz) !== 2) {
        continue;
      }
      const bx = (blip.position.x / this.mapSize) * w;
      const by = (blip.position.z / this.mapSize) * h;
      this.ctx.fillStyle =
        blip.faction === 'player'
          ? '#60a5fa'
          : blip.faction === 'neutral'
            ? '#facc15'
            : '#f87171';
      const sz = blip.isBaseOrBuilding ? 4 : 2.5;
      this.ctx.fillRect(bx - sz / 2, by - sz / 2, sz, sz);
    }

    const cx = (cameraTarget.x / this.mapSize) * w;
    const cy = (cameraTarget.z / this.mapSize) * h;
    this.ctx.strokeStyle = '#f7f0df';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(cx - 11, cy - 9, 22, 18);

    if (this.alarmPingPos && this.alarmPingTimer > 0) {
      this.alarmPingTimer = Math.max(0, this.alarmPingTimer - dt);
      const ax = (this.alarmPingPos.x / this.mapSize) * w;
      const ay = (this.alarmPingPos.z / this.mapSize) * h;
      const pulseRadius = 4 + ((4 - this.alarmPingTimer) * 9) % 14;
      this.ctx.strokeStyle = '#ff4d40';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(ax, ay, pulseRadius, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }
}