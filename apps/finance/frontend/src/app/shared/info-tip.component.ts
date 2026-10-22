import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextInfoTipId = 0;

@Component({
  selector: 'app-info-tip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'info-tip',
    '[class.info-tip--end]': 'align() === "end"',
  },
  template: `
    <button
      type="button"
      class="info-tip__btn"
      [attr.aria-label]="label()"
      [attr.aria-describedby]="tipId"
      (pointerdown)="$event.stopPropagation()"
      (click)="$event.preventDefault(); $event.stopPropagation()"
      (keydown.escape)="$any($event.target).blur()">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 11.2v4.3" />
        <circle cx="12" cy="8.15" r="0.7" />
      </svg>
    </button>
    <span class="info-tip__pop" role="tooltip" [id]="tipId">{{ text() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      position: relative;
      vertical-align: middle;
      width: auto;
      max-width: none;
      line-height: 0;
      flex: 0 0 auto;
    }

    .info-tip__btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.125rem;
      height: 1.125rem;
      min-width: 0;
      min-height: 0;
      margin: 0 0 0 0.28rem;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--text-tertiary);
      line-height: 0;
      text-align: center;
      cursor: pointer;
    }

    .info-tip__btn svg {
      width: 0.95rem;
      height: 0.95rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
    }

    .info-tip__btn svg circle:last-child {
      fill: currentColor;
      stroke: none;
    }

    .info-tip__btn:hover,
    .info-tip__btn:focus-visible {
      color: var(--text-secondary);
    }

    .info-tip__pop {
      position: absolute;
      z-index: 40;
      top: 100%;
      left: 0;
      width: max-content;
      max-width: min(17rem, 70vw);
      margin: 0;
      padding: 0.4rem 0.55rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--card-bg);
      color: var(--text);
      box-shadow: var(--shadow-sm);
      font-size: var(--text-xs);
      font-weight: 400;
      line-height: 1.4;
      letter-spacing: 0;
      text-align: left;
      text-transform: none;
      white-space: normal;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      /* A hidden pop is out of the scrollable overflow. width: max-content
         still widens document.scrollingElement while visibility is hidden. */
      width: 0;
      max-width: 0;
      height: 0;
      overflow: hidden;
      padding: 0;
      border-width: 0;
    }

    :host.info-tip--end .info-tip__pop {
      left: auto;
      right: 0;
    }

    :host(:hover) .info-tip__pop,
    :host(:focus-within) .info-tip__pop {
      visibility: visible;
      opacity: 1;
      pointer-events: auto;
      width: max-content;
      max-width: min(17rem, 70vw);
      height: auto;
      overflow: visible;
      padding: 0.4rem 0.55rem;
      border-width: 1px;
    }
  `,
})
export class InfoTipComponent {
  text = input.required<string>();
  label = input('Details');
  align = input<'start' | 'end'>('start');
  readonly tipId = `info-tip-${++nextInfoTipId}`;
}
