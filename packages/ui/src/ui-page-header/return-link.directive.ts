import { Location } from '@angular/common';
import { Directive, HostListener, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { ReturnContext } from '../return-context';

@Directive({
  selector: 'a[uiReturnLink]',
  host: { '[attr.href]': 'href()' },
})
export class ReturnLinkDirective {
  private readonly context = inject(ReturnContext);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  readonly uiReturnLink = input.required<string>();
  readonly uiReturnSource = input<string | undefined>(undefined);

  href(): string {
    return this.location.prepareExternalUrl(this.uiReturnLink());
  }

  @HostListener('click', ['$event'])
  follow(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!this.context.back(this.uiReturnSource() ?? this.uiReturnLink())) void this.router.navigateByUrl(this.uiReturnLink());
  }
}
