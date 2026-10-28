import { Injectable, TemplateRef, signal } from '@angular/core';

/** A feature can supply its own actions to the shared user dropdown. */
@Injectable({ providedIn: 'root' })
export class UserMenuContent {
  readonly template = signal<TemplateRef<unknown> | null>(null);
}
