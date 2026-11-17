import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { buildingSprite, townSpriteUrl, type TownSpriteId } from './town-sprites';
import { treasuryFace, type TreasuryView } from './weeks-kept';
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
    const kind = this.kind(), habit = this.habit(), lot = this.lot(), building = this.building();
    let name: string, label: string, sprite: TownSpriteId, link = '', external = false;
    if (kind === 'treasury') {
      name = 'Treasury';
      const face = treasuryFace(!this.vaultPresent()
        ? { status: 'locked' }
        : (this.treasury() ?? { status: 'loading' }));
      label = face.label;
      link = face.href;
      external = face.external;
      sprite = face.stage == null ? 'treasury-locked' : buildingSprite('treasury', face.stage);
    } else if (kind === 'library' || kind === 'inn') {
      name = kind === 'library' ? 'Library' : 'Inn';
      const source = kind === 'library' ? 'Media' : 'Travel';
      label = building?.source === 'unavailable' ? `Lv — · ${source} unavailable` : `Lv ${building?.level} · ${source}`;
      sprite = buildingSprite(kind, building?.stage ?? 1); link = kind === 'library' ? '/town/library' : '/travel';
    } else if (lot?.state === 'occupied' && habit) {
      name = habit.name;
      label = `Lv ${habit.level} · ${habit.streak.current}-${habit.streak.unit === 'days' ? 'day' : 'week'} streak`;
      sprite = buildingSprite(habit.building_style, habit.stage);
    } else {
      const locked = lot?.state === 'locked';
      name = locked ? 'Locked lot' : 'Empty lot';
      label = locked ? `Unlocks at Lv ${lot?.unlock_level}` : 'Build here';
      sprite = locked ? 'lot-locked' : 'lot-empty';
    }
    return { name, label, src: townSpriteUrl(sprite), link, external };
  });
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
