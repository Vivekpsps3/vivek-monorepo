import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

export interface UiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

let uiSelectIdSeq = 0;

@Component({
  selector: 'ui-select',
  standalone: true,
  templateUrl: './ui-select.component.html',
  styleUrl: './ui-select.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSelectComponent {
  value = model<string>('');
  options = input<UiSelectOption[]>([]);
  label = input<string | undefined>(undefined);
  selectId = input<string | undefined>(undefined);
  disabled = input(false);
  required = input(false);

  private readonly fallbackId = `ui-select-${++uiSelectIdSeq}`;
  readonly resolvedId = computed(() => this.selectId() ?? this.fallbackId);
}