import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal,
  viewChildren,
} from "@angular/core";
import {
  NG_VALUE_ACCESSOR,
  type ControlValueAccessor,
} from "@angular/forms";

export interface UiSegmentedOption {
  value: string | number;
  label: string;
  ariaLabel?: string;
}

/**
 * A one-of-N radio group rendered as a segmented row of buttons. Also a
 * `ControlValueAccessor`, so it works with `formControlName`.
 */
@Component({
  selector: "ui-segmented",
  standalone: true,
  templateUrl: "./ui-segmented.component.html",
  styleUrl: "./ui-segmented.component.css",
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSegmentedComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSegmentedComponent implements ControlValueAccessor {
  label = input.required<string>();
  labelledBy = input<string | undefined>(undefined);
  options = input.required<readonly UiSegmentedOption[]>();
  value = model<string | number | null>(null);
  size = input<"default" | "compact">("default");
  disabled = input(false);
  wrap = input(true);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly optionButtons =
    viewChildren<ElementRef<HTMLButtonElement>>("optionBtn");

  private onChange: (value: string | number | null) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly cvaDisabled = signal(false);

  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  /** The checked option, or the first option when the value is null/unknown. */
  readonly tabbableIndex = computed(() => {
    const opts = this.options();
    const idx = opts.findIndex((option) => option.value === this.value());
    return idx >= 0 ? idx : 0;
  });

  isChecked(option: UiSegmentedOption): boolean {
    return option.value === this.value();
  }

  tabIndexFor(index: number): number {
    return index === this.tabbableIndex() ? 0 : -1;
  }

  select(option: UiSegmentedOption): void {
    if (this.isDisabled()) return;
    this.value.set(option.value);
    this.onChange(option.value);
  }

  onGroupKeydown(event: KeyboardEvent): void {
    const opts = this.options();
    if (!opts.length || this.isDisabled()) return;
    const buttons = this.optionButtons().map((ref) => ref.nativeElement);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const from = current >= 0 ? current : this.tabbableIndex();
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (from + 1) % opts.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (from - 1 + opts.length) % opts.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = opts.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.select(opts[next]);
    buttons[next]?.focus();
  }

  onGroupFocusOut(event: FocusEvent): void {
    const root = this.host.nativeElement as HTMLElement;
    if (!root.contains(event.relatedTarget as Node)) {
      this.onTouched();
    }
  }

  writeValue(value: string | number | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }
}
