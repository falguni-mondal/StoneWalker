/**
 * STONEWALKER — Touch-First Gesture Controller (Section 14)
 * Supports 1-finger ground pan with inertia, 2-finger pinch-zoom,
 * tap, double-tap (select same type), long-press (rally point), and drag-box select mode.
 */

import { CONFIG } from '../config';
import type { Vec2 } from '../data/types';
import type { CameraRig } from '../render/CameraRig';

export interface TouchInputCallbacks {
  onTap: (screenPos: { x: number; y: number }, worldPos: Vec2) => void;
  onDoubleTap: (screenPos: { x: number; y: number }, worldPos: Vec2) => void;
  onLongPress: (screenPos: { x: number; y: number }, worldPos: Vec2) => void;
  onBoxSelect: (startWorld: Vec2, endWorld: Vec2) => void;
  onDragMoveGhost?: (worldPos: Vec2) => boolean; // Returns true if a building ghost consumed the drag
}

export class TouchController {
  private readonly canvas: HTMLCanvasElement;
  private readonly cameraRig: CameraRig;
  private readonly callbacks: TouchInputCallbacks;

  private boxSelectMode = false;
  private activeTouches = new Map<number, { x: number; y: number }>();
  private startPos = { x: 0, y: 0 };
  private startTime = 0;
  private movedSignificantly = false;
  private lastTapTime = 0;
  private lastTapScreenPos = { x: 0, y: 0 };
  private lastPinchDistance = 0;
  private longPressTimer: number | null = null;
  private boxStartWorld: Vec2 | null = null;

  public constructor(
    canvas: HTMLCanvasElement,
    cameraRig: CameraRig,
    callbacks: TouchInputCallbacks,
  ) {
    this.canvas = canvas;
    this.cameraRig = cameraRig;
    this.callbacks = callbacks;
    this.bindTouchEvents();
  }

  public setBoxSelectMode(enabled: boolean): void {
    this.boxSelectMode = enabled;
  }

  public isBoxSelectMode(): boolean {
    return this.boxSelectMode;
  }

  private bindTouchEvents(): void {
    this.canvas.addEventListener('touchstart', this.onTouchStart, {
      passive: false,
    });
    this.canvas.addEventListener('touchmove', this.onTouchMove, {
      passive: false,
    });
    this.canvas.addEventListener('touchend', this.onTouchEnd, {
      passive: false,
    });
    this.canvas.addEventListener('touchcancel', this.onTouchEnd, {
      passive: false,
    });
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private readonly onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }

    if (this.activeTouches.size === 1) {
      const first = e.touches[0]!;
      this.startPos = { x: first.clientX, y: first.clientY };
      this.startTime = performance.now();
      this.movedSignificantly = false;

      if (this.boxSelectMode) {
        this.boxStartWorld = this.cameraRig.screenToGround(
          first.clientX,
          first.clientY,
        );
      }

      this.clearLongPressTimer();
      this.longPressTimer = window.setTimeout(() => {
        if (!this.movedSignificantly && this.activeTouches.size === 1) {
          const worldPos = this.cameraRig.screenToGround(
            this.startPos.x,
            this.startPos.y,
          );
          if (worldPos) {
            this.callbacks.onLongPress(this.startPos, worldPos);
          }
          this.movedSignificantly = true; // Prevent subsequent tap trigger
        }
      }, CONFIG.TOUCH_LONG_PRESS_MS);
    } else if (this.activeTouches.size === 2) {
      this.clearLongPressTimer();
      const pts = Array.from(this.activeTouches.values());
      this.lastPinchDistance = Math.hypot(
        pts[0]!.x - pts[1]!.x,
        pts[0]!.y - pts[1]!.y,
      );
    }
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (this.activeTouches.size === 1 && e.touches.length === 1) {
      const t = e.touches[0]!;
      const prev = this.activeTouches.get(t.identifier);
      if (!prev) {
        return;
      }
      const dx = t.clientX - prev.x;
      const dy = t.clientY - prev.y;
      prev.x = t.clientX;
      prev.y = t.clientY;

      if (
        Math.hypot(t.clientX - this.startPos.x, t.clientY - this.startPos.y) >
        10
      ) {
        this.movedSignificantly = true;
        this.clearLongPressTimer();
      }

      const worldPos = this.cameraRig.screenToGround(t.clientX, t.clientY);
      if (
        worldPos &&
        this.callbacks.onDragMoveGhost &&
        this.callbacks.onDragMoveGhost(worldPos)
      ) {
        return;
      }

      if (!this.boxSelectMode && this.movedSignificantly) {
        this.cameraRig.panByScreenDelta(dx, dy);
      }
    } else if (this.activeTouches.size >= 2 && e.touches.length >= 2) {
      this.clearLongPressTimer();
      this.movedSignificantly = true;
      const t0 = e.touches[0]!;
      const t1 = e.touches[1]!;
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      if (this.lastPinchDistance > 10 && dist > 10) {
        const factor = this.lastPinchDistance / dist;
        this.cameraRig.zoomByFactor(factor);
      }
      this.lastPinchDistance = dist;
    }
  };

  private readonly onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    this.clearLongPressTimer();

    if (
      this.activeTouches.size === 1 &&
      !this.movedSignificantly &&
      performance.now() - this.startTime < CONFIG.TOUCH_LONG_PRESS_MS
    ) {
      const worldPos = this.cameraRig.screenToGround(
        this.startPos.x,
        this.startPos.y,
      );
      if (worldPos) {
        const now = performance.now();
        const distFromLastTap = Math.hypot(
          this.startPos.x - this.lastTapScreenPos.x,
          this.startPos.y - this.lastTapScreenPos.y,
        );
        if (
          now - this.lastTapTime <= CONFIG.TOUCH_DOUBLE_TAP_MS &&
          distFromLastTap < 36
        ) {
          this.callbacks.onDoubleTap(this.startPos, worldPos);
          this.lastTapTime = 0;
        } else {
          this.callbacks.onTap(this.startPos, worldPos);
          this.lastTapTime = now;
          this.lastTapScreenPos = { ...this.startPos };
        }
      }
    } else if (
      this.boxSelectMode &&
      this.boxStartWorld &&
      e.changedTouches.length > 0
    ) {
      const last = e.changedTouches[0]!;
      const endWorld = this.cameraRig.screenToGround(
        last.clientX,
        last.clientY,
      );
      if (endWorld) {
        this.callbacks.onBoxSelect(this.boxStartWorld, endWorld);
      }
      this.boxStartWorld = null;
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      this.activeTouches.delete(t.identifier);
    }
  };
}