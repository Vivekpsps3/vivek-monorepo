import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ThemeService, UiCardComponent, type ThemeChoice } from '@vivek/ui';
import { SceneAppearanceService } from '../platform/scene-appearance.service';
import type { SeasonChoice } from '../platform/scene-appearance';

@Component({
  selector: 'app-appearance-section',
  standalone: true,
  imports: [UiCardComponent, RouterLink],
  templateUrl: './appearance-section.component.html',
  styleUrl: './appearance-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearanceSectionComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly savedNote = viewChild<ElementRef<HTMLElement>>('savedNote');
  private readonly saveError = viewChild<ElementRef<HTMLElement>>('saveError');

  readonly theme = inject(ThemeService);
  readonly scene = inject(SceneAppearanceService);
  readonly notice = signal('');
  readonly choices: { value: ThemeChoice; label: string; preview: ThemeChoice | null }[] = [
    { value: 'system', label: 'System', preview: null },
    { value: 'light', label: 'Light', preview: 'light' },
    { value: 'dark', label: 'Dark', preview: 'dark' },
  ];
  readonly seasonChoices: { value: SeasonChoice; label: string }[] = [
    { value: 'automatic', label: 'Automatic' },
    { value: 'default', label: 'Default' },
    { value: 'spring', label: 'Spring' },
    { value: 'summer', label: 'Summer' },
    { value: 'autumn', label: 'Autumn' },
    { value: 'winter', label: 'Winter' },
  ];

  ngOnInit(): void {
    this.theme.choice$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cdr.markForCheck());
  }

  choose(theme: ThemeChoice): void {
    this.theme.set(theme);
  }

  previewSeason(season: SeasonChoice): void {
    this.notice.set('');
    this.scene.preview({ season });
  }

  previewSoundFrom(event: Event): void {
    const target = event.target;
    this.notice.set('');
    this.scene.preview({ sound: target instanceof HTMLInputElement && target.checked });
  }

  save(): void {
    this.notice.set('');
    const ok = this.scene.save();
    if (ok) this.notice.set('Season saved on this device.');
    this.cdr.detectChanges();
    (ok ? this.savedNote() : this.saveError())?.nativeElement.focus();
  }

  discard(): void {
    this.notice.set('');
    this.scene.discard();
    const season = this.scene.effective().season;
    this.host.nativeElement.querySelector<HTMLInputElement>(`input[name="town-season"][value="${season}"]`)?.focus();
  }
}
