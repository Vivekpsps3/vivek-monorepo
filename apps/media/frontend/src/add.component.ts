import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
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
  UiIconComponent,
  UiPageHeaderComponent,
} from "@vivek/ui";
import { Detail, Kind, kinds, errorCopy } from "./media.models";
import {
  FIELD_ORDER,
  validateAdd,
  type AddErrors,
} from "./add-validate.mjs";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiButtonComponent,
    UiCardComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiIconComponent,
    UiPageHeaderComponent,
  ],
  styles: `
    .required-legend {
      margin: 0 0 var(--space-3);
    }
    .field-error {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--danger);
      font-size: var(--text-sm);
      margin: var(--space-1) 0 var(--space-3);
    }
  `,
  template: `<main class="page media-page">
    <ui-page-header
      backLabel="← Search"
      backLink="/media/search"
      eyebrow="Make room for a favorite"
      title="Add manually"
      subtitle="Add the rest when you're ready."
    />
    <ui-card
      ><form class="media-form" #form="ngForm" novalidate (ngSubmit)="save()">
        <p class="muted required-legend">
          <span aria-hidden="true">*</span> Required
        </p>
        <ui-field label="Title" [required]="true"
          ><input
            uiFieldControl
            required
            id="add-title"
            name="title"
            maxlength="300"
            [(ngModel)]="title"
            (ngModelChange)="revalidate()"
            [attr.aria-invalid]="errors()['title'] ? true : null"
            [attr.aria-describedby]="
              errors()['title'] ? 'add-title-error' : null
            "
        /></ui-field>
        @if (errors()["title"]) {
          <p class="field-error" id="add-title-error">
            <ui-icon name="alert" size="sm" /> {{ errors()["title"] }}
          </p>
        }
        <ui-field label="Type" [required]="true"
          ><select
            uiFieldControl
            required
            id="add-kind"
            name="kind"
            [(ngModel)]="kind"
            (ngModelChange)="revalidate()"
            [attr.aria-invalid]="errors()['kind'] ? true : null"
            [attr.aria-describedby]="
              errors()['kind'] ? 'add-kind-error' : null
            "
          >
            @for (k of kinds; track k.value) {
              <option [value]="k.value">{{ k.label }}</option>
            }
          </select></ui-field
        >
        @if (errors()["kind"]) {
          <p class="field-error" id="add-kind-error">
            <ui-icon name="alert" size="sm" /> {{ errors()["kind"] }}
          </p>
        }
        <details #optionalDetails>
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
              id="add-year"
              name="year"
              [(ngModel)]="year"
              (ngModelChange)="revalidate()"
              [attr.aria-invalid]="errors()['year'] ? true : null"
              [attr.aria-describedby]="
                errors()['year'] ? 'add-year-error' : null
              " /></ui-field
          >
          @if (errors()["year"]) {
            <p class="field-error" id="add-year-error">
              <ui-icon name="alert" size="sm" /> {{ errors()["year"] }}
            </p>
          }
          <ui-field label="Note">
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
          <ui-button variant="primary" type="submit" [disabled]="busy()">
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
  readonly errors = signal<AddErrors>({});
  submitted = false;
  @ViewChild("optionalDetails")
  private optionalDetails?: ElementRef<HTMLDetailsElement>;
  private saved = false;
  revalidate(): void {
    if (this.submitted)
      this.errors.set(
        validateAdd({ title: this.title, kind: this.kind, year: this.year }),
      );
  }
  focusFirstInvalid(): void {
    const current = this.errors();
    for (const key of FIELD_ORDER) {
      if (!current[key as keyof AddErrors]) continue;
      if (key === "year" && this.optionalDetails)
        this.optionalDetails.nativeElement.open = true;
      document.getElementById("add-" + key)?.focus();
      return;
    }
  }
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
    this.submitted = true;
    this.errors.set(
      validateAdd({ title: this.title, kind: this.kind, year: this.year }),
    );
    if (Object.keys(this.errors()).length) {
      this.focusFirstInvalid();
      return;
    }
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
