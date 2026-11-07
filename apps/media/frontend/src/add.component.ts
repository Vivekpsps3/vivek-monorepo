import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  SESSION_CONTEXT,
  ConfirmService,
  UiButtonComponent,
  UiCardComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiPageHeaderComponent,
} from "@vivek/ui";
import { Detail, Kind, kinds, errorCopy } from "./media.models";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiButtonComponent,
    UiCardComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiPageHeaderComponent,
  ],
  template: `<main class="page media-page">
    <ui-page-header
      backLabel="← Search"
      backLink="/media/search"
      eyebrow="Make room for a favorite"
      title="Add manually"
      subtitle="Title and type are required. Add the rest when you're ready."
    />
    <ui-card
      ><form class="media-form" #form="ngForm" (ngSubmit)="save()">
        <ui-field label="Title" [required]="true"
          ><input
            uiFieldControl
            required
            name="title"
            maxlength="300"
            [(ngModel)]="title"
        /></ui-field>
        <ui-field label="Type" [required]="true"
          ><select uiFieldControl required name="kind" [(ngModel)]="kind">
            @for (k of kinds; track k.value) {
              <option [value]="k.value">{{ k.label }}</option>
            }
          </select></ui-field
        >
        <details>
          <summary>Optional details</summary>
          <ui-field label="Creator"
            ><input
              uiFieldControl
              name="creator"
              maxlength="300"
              [(ngModel)]="creator" /></ui-field
          ><ui-field label="Release year"
            ><input
              uiFieldControl
              type="number"
              min="1000"
              max="3000"
              name="year"
              [(ngModel)]="year" /></ui-field
          ><ui-field label="Note">
            <textarea
              uiFieldControl
              name="review"
              maxlength="20000"
              [(ngModel)]="review"
            ></textarea>
          </ui-field>
        </details>
        @if (error()) {
          <p class="local-error" role="alert">{{ error() }}</p>
        }
        <div class="button-row">
          <ui-button
            variant="primary"
            type="submit"
            [disabled]="!form.valid || busy()"
          >
            {{
              busy()
                ? "Adding…"
                : kind === "artist"
                  ? "Follow artist"
                  : "Add to library"
            }}</ui-button
          ><a routerLink="/media/library">Cancel</a>
        </div>
      </form></ui-card
    >
  </main>`,
})
export class AddComponent {
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  readonly kinds = kinds;
  title = inject(ActivatedRoute).snapshot.queryParamMap.get("title") || "";
  kind: Kind = "movie";
  creator = "";
  year: number | null = null;
  review = "";
  readonly error = signal("");
  readonly busy = signal(false);
  private saved = false;
  canLeave(): boolean | Promise<boolean> {
    return (
      !this.ownsSession ||
      this.saved ||
      !(this.title || this.creator || this.review) ||
      this.confirm.ask(
        "Leave this draft?",
        "This item has not been added yet.",
        "Leave draft",
        "Keep editing",
      )
    );
  }
  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    if (this.ownsSession && !this.saved && (this.title || this.review)) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  save(): void {
    if (this.busy()) return;
    this.error.set("");
    this.busy.set(true);
    this.http
      .post<Detail>("/media/api/library", {
        title: this.title,
        kind: this.kind,
        creator: this.creator || null,
        year: this.year,
        review: this.review || null,
        status: this.kind === "artist" ? "following" : "want",
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.saved = true;
          this.router.navigate(["/media/item", d.id]);
        },
        error: (e) => {
          this.error.set(errorCopy(e));
          this.busy.set(false);
        },
      });
  }
}
