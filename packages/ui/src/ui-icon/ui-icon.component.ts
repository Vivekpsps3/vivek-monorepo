import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiIconName =
  | 'dashboard'
  | 'scale'
  | 'portfolio'
  | 'transactions'
  | 'calendar'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'grid'
  | 'plus'
  | 'upload'
  | 'wallet'
  | 'trending'
  | 'building'
  | 'credit-card'
  | 'document'
  | 'spark'
  | 'users'
  | 'shield'
  | 'alert'
  | 'lock';

/** Lucide-style 24×24 stroke icons (currentColor). */
const PATHS: Record<UiIconName, string> = {
  dashboard:
    'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  scale: 'M12 3v18M5 7h14M7 7l-2 5h4l-2-5zM17 7l-2 5h4l-2-5z',
  portfolio: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  transactions: 'M7 7h10M7 12h10M7 17h6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  calendar:
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 3v12M8 7l4-4 4 4M4 21h16',
  wallet: 'M19 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 14h.01',
  trending: 'M3 17l6-6 4 4 8-10',
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12h12M6 16h12M6 8h12M10 6h.01M14 6h.01',
  'credit-card': 'M2 8h20M6 16h4M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  document: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6',
  spark: 'M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  alert: 'M12 8v5M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z',
};

@Component({
  selector: 'ui-icon',
  standalone: true,
  template: `
    <svg
      class="ui-icon"
      [class.ui-icon--sm]="size() === 'sm'"
      [class.ui-icon--md]="size() === 'md'"
      [class.ui-icon--lg]="size() === 'lg'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true">
      <path [attr.d]="path" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
      color: currentColor;
    }
    .ui-icon--sm {
      width: 16px;
      height: 16px;
    }
    .ui-icon--md {
      width: 20px;
      height: 20px;
    }
    .ui-icon--lg {
      width: 24px;
      height: 24px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiIconComponent {
  name = input.required<UiIconName>();
  size = input<'sm' | 'md' | 'lg'>('md');

  get path(): string {
    return PATHS[this.name()];
  }
}
