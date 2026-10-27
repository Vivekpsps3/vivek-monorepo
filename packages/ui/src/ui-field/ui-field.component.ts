import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  afterRenderEffect,
  contentChild,
  inject,
  input,
} from '@angular/core';

let uiFieldSeq = 0;

/** Marks the control inside ui-field so the field can set aria-invalid. */
@Directive({
  selector: '[uiFieldControl]',
  standalone: true,
})
export class UiFieldControlDirective {
  readonly element = inject(ElementRef<HTMLElement>);
}

@Component({
  selector: 'ui-field',
  standalone: true,
  templateUrl: './ui-field.component.html',
  styleUrl: './ui-field.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiFieldComponent {
  label = input<string | undefined>(undefined);
  optional = input(false);
  required = input(false);
  hint = input<string | undefined>(undefined);
  error = input<string | null | undefined>(undefined);
  fieldId = input<string | undefined>(undefined);

  private readonly control = contentChild(UiFieldControlDirective);
  private readonly fallbackId = `ui-field-${++uiFieldSeq}`;

  constructor() {
    afterRenderEffect(() => {
      const control = this.control()?.element.nativeElement;
      if (!control) return;
      const id = this.controlId(control);
      if (!control.id) control.id = id;
      const error = this.error()?.trim() ?? '';
      const hint = this.hint()?.trim() ?? '';
      const errorId = `${id}-error`;
      const hintId = `${id}-hint`;
      if (error) {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', [hint ? hintId : '', errorId].filter(Boolean).join(' '));
      } else {
        control.removeAttribute('aria-invalid');
        if (hint) control.setAttribute('aria-describedby', hintId);
        else control.removeAttribute('aria-describedby');
      }
      if (this.required()) control.setAttribute('aria-required', 'true');
      else control.removeAttribute('aria-required');
    });
  }

  resolvedId(): string {
    const control = this.control()?.element.nativeElement;
    return control ? this.controlId(control) : this.fallbackId;
  }

  private controlId(control: HTMLElement): string {
    return control.id || this.fieldId() || this.fallbackId;
  }
}
