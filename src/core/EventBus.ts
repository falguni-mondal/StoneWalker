/**
 * STONEWALKER — Strongly Typed EventBus
 * Uses a Map<keyof Events, Set<handler>> with a single internal cast helper
 * so the public API stays strictly typed, and iterates over a copy when emitting.
 */

import type { GameEvents } from '../data/types';

export type EventHandler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

type GenericHandler = (payload: never) => void;

export class EventBus {
  private readonly handlers = new Map<keyof GameEvents, Set<GenericHandler>>();

  private getHandlerSet<K extends keyof GameEvents>(
    event: K,
  ): Set<EventHandler<K>> {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set<GenericHandler>();
      this.handlers.set(event, set);
    }
    // Single internal cast helper keeping the public API 100% strictly typed
    return set as unknown as Set<EventHandler<K>>;
  }

  public on<K extends keyof GameEvents>(
    event: K,
    handler: EventHandler<K>,
  ): () => void {
    const set = this.getHandlerSet(event);
    set.add(handler);
    return () => {
      this.off(event, handler);
    };
  }

  public off<K extends keyof GameEvents>(
    event: K,
    handler: EventHandler<K>,
  ): void {
    const set = this.getHandlerSet(event);
    set.delete(handler);
  }

  public emit<K extends keyof GameEvents>(
    event: K,
    payload: GameEvents[K],
  ): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) {
      return;
    }
    // Iterate over a shallow copy so handlers can safely subscribe/unsubscribe during emit
    const snapshot = Array.from(set) as EventHandler<K>[];
    for (const handler of snapshot) {
      handler(payload);
    }
  }

  public clear(): void {
    this.handlers.clear();
  }
}