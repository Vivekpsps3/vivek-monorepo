import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type UiButtonSize = 'sm' | 'md';

@Component({
  selector: 'ui-button',
  standalone: true,
  templateUrl: './ui-button.component.html',
  styleUrl: './ui-button.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiButtonComponent {
  variant = input<UiButtonVariant>('primary');
  size = input<UiButtonSize>('md');
  disabled = input(false);
  busy = input(false);
  type = input<'button' | 'submit' | 'reset'>('button');
  ariaLabel = input<string | undefined>(undefined);
  tooltip = input<string | undefined>(undefined);

  clicked = output<MouseEvent>();

  hostClass = computed(() => {
    const v = this.variant();
    const s = this.size();
    return `ui-btn ui-btn--${v} ui-btn--${s}`;
  });

  onClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.type() === 'button') {
      event.preventDefault();
    }
    this.clicked.emit(event);
  }
}
