/**
 * STONEWALKER — Contextual Non-Blocking Tutorial Hint Bubbles (Section 16)
 * Short step-by-step guidance for new players with a Next and Skip button.
 */

export class TutorialOverlay {
  private readonly cardEl: HTMLElement;
  private stepIndex = 0;
  private skipped = false;

  private readonly hints: readonly string[] = [
    'Welcome to STONEWALKER! Tap your giant Council Walker Base, then tap MOVE MODE to walk your fortress across the map and stomp trees into Wood.',
    'Smart Camp: Idle Workers automatically gather nearby resources after 15 seconds, and Troops spread out to guard your Base.',
    'Tap BUILD (bottom-right) to place Huts, War Barracks, and a Weapon Station. During Base Alarms, Workers grab stocked weapons to defend!',
    'Use your Chieftain Hero ability (bottom-left) and Spirit Powers to crush the enemy tribe’s Council Walker!',
  ];

  public constructor(parent: HTMLElement) {
    this.cardEl = document.createElement('aside');
    this.cardEl.className = 'parchment-card';
    this.cardEl.style.cssText = `
      position: fixed;
      top: calc(var(--safe-top) + 74px);
      left: calc(var(--safe-left) + 12px);
      max-width: 340px;
      padding: 12px 14px;
      display: none;
      flex-direction: column;
      gap: 8px;
      z-index: 24;
    `;
    parent.appendChild(this.cardEl);
  }

  public startIfFirstLevel(levelId: number): void {
    if (this.skipped || levelId !== 1) {
      this.cardEl.style.display = 'none';
      return;
    }
    this.stepIndex = 0;
    this.render();
    this.cardEl.style.display = 'flex';
  }

  public hide(): void {
    this.cardEl.style.display = 'none';
  }

  private render(): void {
    const text = this.hints[this.stepIndex] ?? '';
    this.cardEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:0.88rem;">Elder's Guide (${this.stepIndex + 1}/${this.hints.length})</strong>
        <button id="tut-skip" class="sw-btn" style="min-height:30px;padding:2px 10px;font-size:0.72rem;">Skip</button>
      </div>
      <div style="font-size:0.82rem;">${text}</div>
      <div style="display:flex;justify-content:flex-end;">
        <button id="tut-next" class="sw-btn sw-btn-primary" style="min-height:34px;padding:4px 14px;font-size:0.78rem;">
          ${this.stepIndex < this.hints.length - 1 ? 'Next Tip →' : 'Got It!'}
        </button>
      </div>
    `;

    this.cardEl.querySelector('#tut-skip')?.addEventListener('click', () => {
      this.skipped = true;
      this.hide();
    });

    this.cardEl.querySelector('#tut-next')?.addEventListener('click', () => {
      this.stepIndex += 1;
      if (this.stepIndex >= this.hints.length) {
        this.hide();
      } else {
        this.render();
      }
    });
  }
}