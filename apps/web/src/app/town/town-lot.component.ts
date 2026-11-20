import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { buildingSprite, townSpriteUrl } from './town-sprites';
import { lotFace } from './town-exterior';
import type { TreasuryView } from './weeks-kept';
import type { Building, Habit, TownResponse } from './town.types';

@Component({
  selector: 'app-town-lot',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './town-lot.component.html',
  styleUrl: './town-lot.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownLotComponent {
  kind = input<'library' | 'inn' | 'treasury' | 'habit'>('habit');
  building = input<Building>();
  lot = input<TownResponse['lots'][number]>();
  habit = input<Habit>();
  vaultPresent = input(false);
  /** Completed Finance budget weeks. Habit streaks do not fill this in. */
  treasury = input<TreasuryView | null>(null);
  /** Previous stage while the 240ms swap plays. Null skips the old sprite, including reduced motion. */
  swapFrom = input<1 | 2 | 3 | null>(null);
  openHabit = output<void>();
  readonly oldStage = signal<1 | 2 | 3 | null>(null);
  constructor() {
    effect(onCleanup => {
      const from = this.swapFrom();
      if (from == null || prefersReducedMotion()) {
        this.oldStage.set(null);
        return;
      }
      this.oldStage.set(from);
      const id = window.setTimeout(() => this.oldStage.set(null), 240);
      onCleanup(() => window.clearTimeout(id));
    });
  }
  oldSrc(): string | null {
    const old = this.oldStage();
    if (old == null) return null;
    const kind = this.kind();
    if (kind === 'library' || kind === 'inn') return townSpriteUrl(buildingSprite(kind, old));
    const style = this.habit()?.building_style;
    return style ? townSpriteUrl(buildingSprite(style, old)) : null;
  }
  readonly view = computed(() => {
    const face = lotFace({
      kind: this.kind(),
      building: this.building(),
      lot: this.lot(),
      habit: this.habit(),
      vaultPresent: this.vaultPresent(),
      treasury: this.treasury(),
    });
    return { name: face.name, label: face.label, src: face.src, link: face.link, external: face.external };
  });
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
