/**
 * STONEWALKER — Deterministic Seeded RNG (mulberry32)
 * Used for all map generation and gameplay randomness so seeds replay identically.
 */

export class RNG {
  private state: number;
  private readonly initialSeed: number;

  public constructor(seed: number = 1337) {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed === 0 ? 0x6d2b79f5 : this.initialSeed;
  }

  /**
   * Returns a deterministic float in [0, 1).
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a deterministic float in [min, max).
   */
  public nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns a deterministic integer in [min, max] inclusive.
   */
  public nextInt(min: number, max: number): number {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(this.next() * (high - low + 1)) + low;
  }

  /**
   * Returns true with the given probability in [0, 1].
   */
  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Picks a random element from a non-empty readonly array.
   */
  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('RNG.pick called on an empty array');
    }
    const index = this.nextInt(0, items.length - 1);
    return items[index]!;
  }

  /**
   * Creates a derived seed for map regeneration retries (Section 11).
   */
  public deriveSeed(attempt: number): number {
    return ((this.initialSeed ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0) || 1;
  }

  public getSeed(): number {
    return this.initialSeed;
  }

  public getState(): number {
    return this.state;
  }

  public setState(state: number): void {
    this.state = state >>> 0;
  }
}