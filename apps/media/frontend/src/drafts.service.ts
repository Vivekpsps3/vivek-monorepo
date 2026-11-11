import { DestroyRef, Injectable, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SESSION_CONTEXT } from "@vivek/ui";
import {
  MAX_TAG_LENGTH,
  MAX_TAGS,
  normaliseTags,
} from "./tag-model.mjs";
export interface ItemFields {
  review: string;
  rating: number | null;
  status: string;
  progress: number | null;
  unit: string;
  favorite: boolean;
  anticipated: boolean;
  /** Absent on drafts written before the tag editor. Empty means the user cleared every tag. */
  tags?: string[];
  /** Uncommitted tag-field text. It is not a tag until Enter. */
  tagText?: string;
}
export interface ItemDraft {
  base: string;
  fields: ItemFields;
}
const PREFIX = "media-item-draft:";
const UNITS = new Set(["", "page", "percent", "episode", "hour"]);
const STATES = new Set([
  "want",
  "anticipating",
  "in_progress",
  "completed",
  "paused",
  "dropped",
  "following",
  "unfollowed",
]);
/** A bounded, per-tab recovery copy. It is never sent until the user saves. */
@Injectable({ providedIn: "root" })
export class MediaDrafts {
  private readonly session = inject(SESSION_CONTEXT);
  constructor() {
    this.session.cleared$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        try {
          for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
          }
        } catch {
          /* Storage can be unavailable in private browsing. */
        }
      });
  }
  private key(id: number): string {
    return `${PREFIX}${this.session.currentUser?.id}:${id}`;
  }
  read(id: number): ItemDraft | null {
    try {
      const draft = JSON.parse(sessionStorage.getItem(this.key(id)) || "null");
      const fields = draft?.fields;
      const number = (value: unknown) =>
        value === null ||
        (typeof value === "number" && Number.isFinite(value) && value >= 0);
      if (
        typeof draft?.base !== "string" ||
        !fields ||
        typeof fields.review !== "string" ||
        fields.review.length > 20000 ||
        !number(fields.rating) ||
        (fields.rating !== null && fields.rating > 10) ||
        !number(fields.progress) ||
        !UNITS.has(fields.unit) ||
        !STATES.has(fields.status) ||
        typeof fields.favorite !== "boolean" ||
        typeof fields.anticipated !== "boolean"
      )
        return null;
      const tags = draftTags(fields);
      const tagText = draftTagText(fields);
      if (tags === null || tagText === null) return null;
      return {
        base: draft.base,
        fields: {
          review: fields.review,
          rating: fields.rating,
          status: fields.status,
          progress: fields.progress,
          unit: fields.unit,
          favorite: fields.favorite,
          anticipated: fields.anticipated,
          ...(tags !== undefined ? { tags } : {}),
          ...(tagText !== undefined ? { tagText } : {}),
        },
      };
    } catch {
      return null;
    }
  }
  write(id: number, draft: ItemDraft): void {
    if (!this.session.currentUser) return;
    try {
      const key = this.key(id);
      const keys = Object.keys(sessionStorage).filter(
        (item) => item.startsWith(PREFIX) && item !== key,
      );
      while (keys.length >= 10) sessionStorage.removeItem(keys.shift()!);
      sessionStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* The form remains usable if storage is full or disabled. */
    }
  }
  remove(id: number): void {
    try {
      sessionStorage.removeItem(this.key(id));
    } catch {
      /* private mode */
    }
  }
}

/** `undefined` keeps a pre-tag draft. `null` rejects a corrupt tag list. */
function draftTags(fields: { tags?: unknown }): string[] | undefined | null {
  if (!Object.prototype.hasOwnProperty.call(fields, "tags")) return undefined;
  const value = fields.tags;
  if (!Array.isArray(value) || value.length > MAX_TAGS) return null;
  if (value.some((tag) => typeof tag !== "string")) return null;
  const tags = normaliseTags(value);
  if (tags.some((tag) => [...tag].length > MAX_TAG_LENGTH)) return null;
  return tags;
}

function draftTagText(fields: {
  tagText?: unknown;
}): string | undefined | null {
  if (!Object.prototype.hasOwnProperty.call(fields, "tagText")) return undefined;
  const value = fields.tagText;
  if (typeof value !== "string" || value.length > 500) return null;
  return value;
}
