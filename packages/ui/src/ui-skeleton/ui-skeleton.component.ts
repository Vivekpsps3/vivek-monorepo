import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type UiSkeletonVariant = 'lines' | 'block' | 'circle';

@Component({
  selector: 'ui-skeleton',
  standalone: true,
  templateUrl: './ui-skeleton.component.html',
  styleUrl: './ui-skeleton.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSkeletonComponent {
  variant = input<UiSkeletonVariant>('block');
  lines = input(3);
  width = input<string | undefined>(undefined);
  height = input<string | undefined>(undefined);

  lineIndices = computed(() => Array.from({ length: Math.max(1, this.lines()) }, (_, i) => i));
}