/**
 * STONEWALKER — Toast Stack & Screen-Edge Alert Pulse Manager (Sections 9B & 16)
 * Stacks at most 3 short toasts below the top bar; tapping an alert toast jumps the camera.
 */

import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import type { Vec2 } from '../data/types';

export class NotificationManager {
  private readonly toastContainer: HTMLElement;
  private readonly damageOverlay: HTMLElement;
  private readonly onJumpCamera: (pos: Vec2) => void;

  public constructor(
    parent: HTMLElement,
    damageOverlay: HTMLElement,
    bus: EventBus,
    onJumpCamera: (pos: Vec2) => void,
  ) {
    this.damageOverlay = damageOverlay;
    this.onJumpCamera = onJumpCamera;

    this.toastContainer = document.createElement('div');
    this.toastContainer.className = 'toast-container';
    parent.appendChild(this.toastContainer);

    bus.on('ui:toast', ({ message, level, jumpTo }) => {
      this.pushToast(message, level, jumpTo);
    });

    bus.on('alarm:triggered', ({ faction }) => {
      if (faction === 'player') {
        this.damageOverlay.classList.add('active');
      }
    });

    bus.on('alarm:cleared', ({ faction }) => {
      if (faction === 'player') {
        this.damageOverlay.classList.remove('active');
      }
    });
  }

  public pushToast(
    message: string,
    level: 'info' | 'warning' | 'danger' | 'success' = 'info',
    jumpTo?: Vec2,
  ): void {
    const item = document.createElement('div');
    item.className = 'stone-panel toast-item';
    item.style.borderColor =
      level === 'danger'
        ? 'var(--accent-danger)'
        : level === 'success'
          ? 'var(--accent-success)'
          : level === 'warning'
            ? 'var(--accent-primary)'
            : 'var(--accent-gold)';

    item.textContent = jumpTo ? `${message} (Tap to view)` : message;

    if (jumpTo) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        this.onJumpCamera(jumpTo);
        item.remove();
      });
    }

    this.toastContainer.appendChild(item);
    while (this.toastContainer.children.length > CONFIG.MAX_TOASTS_VISIBLE) {
      this.toastContainer.firstElementChild?.remove();
    }

    window.setTimeout(() => {
      item.remove();
    }, 3600);
  }
}