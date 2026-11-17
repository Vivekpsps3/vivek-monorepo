import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, inject, input } from '@angular/core';

let nextTableCaptionId = 0;

@Component({
  selector: 'ui-data-table',
  standalone: true,
  templateUrl: './ui-data-table.component.html',
  styleUrl: './ui-data-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiDataTableComponent implements AfterViewInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>);
  private observer?: MutationObserver;

  compact = input(false);
  stickyHeader = input(false);
  caption = input<string | undefined>(undefined);
  ariaLabel = input<string | undefined>(undefined);
  readonly captionId = `ui-table-caption-${++nextTableCaptionId}`;

  ngAfterViewInit(): void {
    this.labelCells();
    this.observer = new MutationObserver(() => this.labelCells());
    this.observer.observe(this.host.nativeElement, { childList: true, characterData: true, subtree: true });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /** Copies column names onto cells so a narrow screen can show each value with its heading. */
  private labelCells(): void {
    const table = this.host.nativeElement.querySelector('table');
    if (!table) return;
    const headers = Array.from(table.querySelectorAll('thead th'), (cell: Element) =>
      (cell.textContent || '').replace(/\s+/g, ' ').trim());
    table.querySelectorAll('tbody tr').forEach((row: Element) => {
      let index = 0;
      Array.from(row.children).forEach((cell: Element) => {
        if (!(cell instanceof HTMLTableCellElement)) return;
        if (cell.tagName === 'TD') {
          const label = cell.colSpan > 1 ? '' : headers[index] || '';
          if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
        }
        index += cell.colSpan || 1;
      });
    });
  }
}
