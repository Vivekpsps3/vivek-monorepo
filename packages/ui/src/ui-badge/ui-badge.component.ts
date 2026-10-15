import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type UiBadgeVariant = 'default' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'ui-badge',
  standalone: true,
  templateUrl: './ui-badge.component.html',
  styleUrl: './ui-badge.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiBadgeComponent {
  variant = input<UiBadgeVariant>('default');

  hostClass = computed(() => `ui-badge ui-badge--${this.variant()}`);
}