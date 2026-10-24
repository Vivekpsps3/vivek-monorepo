import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';

let uiInputIdSeq = 0;

@Component({
  selector: 'ui-input',
  standalone: true,
  templateUrl: './ui-input.component.html',
  styleUrl: './ui-input.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiInputComponent {
  value = model<string>('');
  label = input<string | undefined>(undefined);
  inputId = input<string | undefined>(undefined);
  type = input<'text' | 'email' | 'password' | 'number' | 'date' | 'month' | 'search'>('text');
  placeholder = input<string | undefined>(undefined);
  disabled = input(false);
  required = input(false);
  autocomplete = input<string | undefined>(undefined);
  describedBy = input<string | undefined>(undefined);
  invalid = input(false);
  showPasswordToggle = input(false);
  passwordVisible = signal(false);

  private readonly fallbackId = `ui-input-${++uiInputIdSeq}`;
  readonly resolvedId = computed(() => this.inputId() ?? this.fallbackId);
  readonly resolvedType = computed(() => {
    if (this.type() !== 'password' || !this.showPasswordToggle()) return this.type();
    return this.passwordVisible() ? 'text' : 'password';
  });

  togglePasswordVisibility(): void {
    if (this.disabled()) return;
    this.passwordVisible.update(visible => !visible);
  }
}
