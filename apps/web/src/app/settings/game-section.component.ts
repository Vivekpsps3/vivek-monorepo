import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { UiButtonComponent, UiCardComponent } from '@vivek/ui';
import { SceneAppearanceService } from '../platform/scene-appearance.service';
import type { MotionChoice } from '../platform/scene-appearance';

@Component({
  selector: 'app-game-section',
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent],
  templateUrl: './game-section.component.html',
  styleUrl: './game-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameSectionComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly saveError = viewChild<ElementRef<HTMLElement>>('saveError');

  readonly scene = inject(SceneAppearanceService);
  readonly notice = signal('');
  readonly motionChoices: { value: MotionChoice; label: string }[] = [
    { value: 'system', label: 'Follow this device' },
    { value: 'reduce', label: 'Reduce motion' },
  ];

  protected volumePercent(): number {
    return Math.round(this.scene.effective().volume * 100);
  }

  protected muted(): boolean {
    return !this.scene.effective().sound;
  }

  protected muteFrom(event: Event): void {
    const target = event.target;
    this.commit({ sound: !(target instanceof HTMLInputElement && target.checked) });
  }

  protected volumeFrom(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const percent = Number(target.value);
    if (!Number.isFinite(percent)) return;
    this.commit({ volume: percent / 100 });
  }

  protected motionFrom(motion: MotionChoice): void {
    this.commit({ motion });
  }

  protected decorationFrom(event: Event): void {
    const target = event.target;
    this.commit({ decoration: target instanceof HTMLInputElement && target.checked });
  }

  private commit(patch: Parameters<SceneAppearanceService['persist']>[0]): void {
    this.notice.set('');
    const ok = this.scene.persist(patch);
    if (ok) this.notice.set('Saved on this device.');
    this.cdr.detectChanges();
    if (!ok) this.saveError()?.nativeElement.focus();
  }
}
