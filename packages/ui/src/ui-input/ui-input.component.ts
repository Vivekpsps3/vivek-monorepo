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
  /** Helper text under the control. Included in the input's accessible description. */
  hint = input<string | undefined>(undefined);
  invalid = input(false);
  showPasswordToggle = input(false);
  passwordVisible = signal(false);

  private readonly fallbackId = `ui-input-${++uiInputIdSeq}`;
  readonly resolvedId = computed(() => this.inputId() ?? this.fallbackId);
  readonly hintId = computed(() => `${this.resolvedId()}-hint`);
  readonly ariaDescribedBy = computed(() => {
    const ids = [this.hint() ? this.hintId() : null, this.describedBy() ?? null].filter((id): id is string => !!id);
    return ids.length ? ids.join(' ') : null;
  });
  readonly resolvedType = computed(() => {
    if (this.type() !== 'password' || !this.showPasswordToggle()) return this.type();
    return this.passwordVisible() ? 'text' : 'password';
  });

  togglePasswordVisibility(): void {
    if (this.disabled()) return;
    this.passwordVisible.update(visible => !visible);
  }
}
