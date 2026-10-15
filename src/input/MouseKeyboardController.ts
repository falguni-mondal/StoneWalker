/**
 * STONEWALKER — Desktop Mouse & Keyboard Controller with On-Screen Drag Selection Box
 * - Left-click selects unit/building
 * - Left-drag draws a visible green selection box to multi-select units
 * - Right-click issues context commands (move, gather, build/repair, attack, walk Base)
 * - Right-drag / Middle-drag / WASD / Arrow keys pan camera
 */

import type { Vec2 } from '../data/types';
import type { CameraRig } from '../render/CameraRig';

export interface DesktopInputCallbacks {
  onLeftClick: (
    screenPos: { x: number; y: number },
    worldPos: Vec2,
    shiftKey: boolean,
  ) => void;
  onDoubleClick: (screenPos: { x: number; y: number }, worldPos: Vec2) => void;
  onRightClick: (screenPos: { x: number; y: number }, worldPos: Vec2) => void;
  onBoxSelect: (startWorld: Vec2, endWorld: Vec2) => void;
  onHoverWorld?: (worldPos: Vec2) => void;
  onKeyCommand?: (key: string, ctrlKey: boolean) => void;
}

export class MouseKeyboardController {
  private readonly canvas: HTMLCanvasElement;
  private readonly cameraRig: CameraRig;
  private readonly callbacks: DesktopInputCallbacks;
  private readonly pressedKeys = new Set<string>();
  private readonly selectionBoxEl: HTMLElement;

  private isLeftDragging = false;
  private isPanDragging = false;
  private dragStartScreen = { x: 0, y: 0 };
  private prevMouseScreen = { x: 0, y: 0 };

  public constructor(
    canvas: HTMLCanvasElement,
    cameraRig: CameraRig,
    callbacks: DesktopInputCallbacks,
  ) {
    this.canvas = canvas;
    this.cameraRig = cameraRig;
    this.callbacks = callbacks;

    this.selectionBoxEl = document.createElement('div');
    this.selectionBoxEl.style.cssText = `
      position: fixed;
      border: 2px solid var(--accent-success);
      background: rgba(111, 156, 74, 0.22);
      pointer-events: none;
      display: none;
      z-index: 29;
    `;
    document.body.appendChild(this.selectionBoxEl);

    this.bindEvents();
  }

  public update(dt: number): void {
    const speedPx = 560 * dt;
    let dx = 0;
    let dy = 0;
    if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) {
      dy += speedPx;
    }
    if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) {
      dy -= speedPx;
    }
    if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) {
      dx += speedPx;
    }
    if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) {
      dx -= speedPx;
    }
    if (dx !== 0 || dy !== 0) {
      this.cameraRig.panByScreenDelta(dx, dy);
    }
  }

  private bindEvents(): void {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      this.dragStartScreen = { x: e.clientX, y: e.clientY };
      this.prevMouseScreen = { x: e.clientX, y: e.clientY };
      if (e.button === 0) {
        this.isLeftDragging = true;
      } else if (e.button === 1 || e.button === 2) {
        this.isPanDragging = true;
      }
    });

    window.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.prevMouseScreen.x;
      const dy = e.clientY - this.prevMouseScreen.y;
      this.prevMouseScreen = { x: e.clientX, y: e.clientY };

      if (this.isPanDragging) {
        const dist = Math.hypot(
          e.clientX - this.dragStartScreen.x,
          e.clientY - this.dragStartScreen.y,
        );
        if (dist > 6) {
          this.cameraRig.panByScreenDelta(dx, dy);
        }
      } else if (this.isLeftDragging) {
        const dist = Math.hypot(
          e.clientX - this.dragStartScreen.x,
          e.clientY - this.dragStartScreen.y,
        );
        if (dist > 10) {
          const left = Math.min(this.dragStartScreen.x, e.clientX);
          const top = Math.min(this.dragStartScreen.y, e.clientY);
          const width = Math.abs(e.clientX - this.dragStartScreen.x);
          const height = Math.abs(e.clientY - this.dragStartScreen.y);
          this.selectionBoxEl.style.display = 'block';
          this.selectionBoxEl.style.left = `${left}px`;
          this.selectionBoxEl.style.top = `${top}px`;
          this.selectionBoxEl.style.width = `${width}px`;
          this.selectionBoxEl.style.height = `${height}px`;
        }
      }

      if (this.callbacks.onHoverWorld) {
        const worldPos = this.cameraRig.screenToGround(e.clientX, e.clientY);
        if (worldPos) {
          this.callbacks.onHoverWorld(worldPos);
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      const dist = Math.hypot(
        e.clientX - this.dragStartScreen.x,
        e.clientY - this.dragStartScreen.y,
      );

      if (e.button === 0 && this.isLeftDragging) {
        this.isLeftDragging = false;
        this.selectionBoxEl.style.display = 'none';
        const worldPos = this.cameraRig.screenToGround(e.clientX, e.clientY);
        if (dist <= 10 && worldPos) {
          this.callbacks.onLeftClick(
            { x: e.clientX, y: e.clientY },
            worldPos,
            e.shiftKey,
          );
        } else if (worldPos) {
          const startWorld = this.cameraRig.screenToGround(
            this.dragStartScreen.x,
            this.dragStartScreen.y,
          );
          if (startWorld) {
            this.callbacks.onBoxSelect(startWorld, worldPos);
          }
        }
      } else if (e.button === 2 && this.isPanDragging) {
        this.isPanDragging = false;
        if (dist <= 10) {
          const worldPos = this.cameraRig.screenToGround(e.clientX, e.clientY);
          if (worldPos) {
            this.callbacks.onRightClick(
              { x: e.clientX, y: e.clientY },
              worldPos,
            );
          }
        }
      } else if (e.button === 1) {
        this.isPanDragging = false;
      }
    });

    this.canvas.addEventListener('dblclick', (e) => {
      const worldPos = this.cameraRig.screenToGround(e.clientX, e.clientY);
      if (worldPos) {
        this.callbacks.onDoubleClick({ x: e.clientX, y: e.clientY }, worldPos);
      }
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.09 : 0.91;
        this.cameraRig.zoomByFactor(factor);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      this.pressedKeys.add(e.code);
      if (e.code === 'KeyQ') {
        this.cameraRig.rotate90(-1);
      } else if (e.code === 'KeyE') {
        this.cameraRig.rotate90(1);
      } else if (this.callbacks.onKeyCommand) {
        this.callbacks.onKeyCommand(e.code, e.ctrlKey || e.metaKey);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.pressedKeys.delete(e.code);
    });
  }
}