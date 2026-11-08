import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, takeUntil } from 'rxjs';
import { silentErrorToast } from '@vivek/ui';
import type { TownResponse } from '../../town/town.types';
import type { ConceptFieldErrors, ConceptRecord, WorldResponse } from '../world.types';

export interface ConceptCreateRequest {
  name: string;
  note?: string | null;
  source?: string | null;
  understood_on?: string | null;
  tz?: string | null;
}

export interface ConceptPatchRequest {
  name?: string | null;
  note?: string | null;
  source?: string | null;
  understood_on?: string | null;
  archived?: boolean | null;
  tz?: string | null;
}

/** HTTP failure kept as status + code + message + fieldErrors. 404 uses the server detail. */
export class WorldApiError extends Error {
  readonly fieldErrors: ConceptFieldErrors | null;

  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    fieldErrors: ConceptFieldErrors | null,
  ) {
    super(message);
    this.name = 'WorldApiError';
    this.fieldErrors = fieldErrors;
  }
}

export class WorldRequestAborted extends Error {
  constructor() {
    super('aborted');
    this.name = 'WorldRequestAborted';
  }
}

const FIELD_KEYS = ['name', 'note', 'source', 'understood_on'] as const;

function readFieldErrors(value: unknown): ConceptFieldErrors | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const errors: ConceptFieldErrors = {};
  for (const key of FIELD_KEYS) {
    const message = source[key];
    if (typeof message === 'string' && message) errors[key] = message;
  }
  return Object.keys(errors).length ? errors : null;
}

export function mapWorldHttpError(error: unknown): WorldApiError {
  if (error instanceof WorldApiError) return error;
  if (!(error instanceof HttpErrorResponse)) {
    return new WorldApiError(0, null, 'World is unavailable right now.', null);
  }
  const body = error.error;
  const record = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const detail = typeof record?.['detail'] === 'string' ? record['detail'] : null;
  const code = typeof record?.['code'] === 'string' ? record['code'] : null;
  const messageField = typeof record?.['message'] === 'string' ? record['message'] : null;
  const fieldErrors = readFieldErrors(record?.['field_errors']);
  if (error.status === 404) {
    return new WorldApiError(404, code, detail ?? messageField ?? "That concept doesn't exist.", fieldErrors);
  }
  const message = messageField ?? detail ?? 'World is unavailable right now.';
  return new WorldApiError(error.status, code, message, fieldErrors);
}

function abort$(signal: AbortSignal): Observable<void> {
  return new Observable((subscriber) => {
    if (signal.aborted) {
      subscriber.next();
      subscriber.complete();
      return;
    }
    const onAbort = () => {
      subscriber.next();
      subscriber.complete();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    return () => signal.removeEventListener('abort', onAbort);
  });
}

@Injectable({ providedIn: 'root' })
export class WorldApi {
  private readonly http = inject(HttpClient);

  timezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  getWorld(from: string | null, to: string | null, signal: AbortSignal): Promise<WorldResponse> {
    const params: Record<string, string> = { tz: this.timezone() };
    if (from !== null) params['from'] = from;
    if (to !== null) params['to'] = to;
    return this.send(() => this.http.get<WorldResponse>('/api/world', this.options(params)), signal);
  }

  getTown(signal: AbortSignal): Promise<TownResponse> {
    return this.send(
      () => this.http.get<TownResponse>('/api/town', this.options({ tz: this.timezone() })),
      signal,
    );
  }

  listConcepts(archived: boolean, signal: AbortSignal): Promise<ConceptRecord[]> {
    return this.send(
      () => this.http.get<ConceptRecord[]>('/api/world/concepts', this.options({ archived: archived ? '1' : '0' })),
      signal,
    );
  }

  /** Source is plain text. This client never requests that string as a URL. */
  createConcept(body: ConceptCreateRequest, signal: AbortSignal): Promise<ConceptRecord> {
    return this.send(
      () => this.http.post<ConceptRecord>('/api/world/concepts', this.withZone(body), this.options({})),
      signal,
    );
  }

  patchConcept(id: number, body: ConceptPatchRequest, signal: AbortSignal): Promise<ConceptRecord> {
    return this.send(
      () => this.http.patch<ConceptRecord>(`/api/world/concepts/${id}`, this.withZone(body), this.options({})),
      signal,
    );
  }

  deleteConcept(id: number, signal: AbortSignal): Promise<void> {
    return this.send(
      () => this.http.delete(`/api/world/concepts/${id}`, { ...this.options({}), responseType: 'text' }),
      signal,
    ).then(() => undefined);
  }

  private options(params: Record<string, string>) {
    return { params, context: silentErrorToast() };
  }

  private withZone<T extends { tz?: string | null }>(body: T): T {
    if (body.tz !== undefined) return body;
    return { ...body, tz: this.timezone() };
  }

  private async send<T>(work: () => Observable<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) throw new WorldRequestAborted();
    try {
      return await firstValueFrom(work().pipe(takeUntil(abort$(signal))));
    } catch (error) {
      if (signal.aborted || error instanceof WorldRequestAborted) throw new WorldRequestAborted();
      throw mapWorldHttpError(error);
    }
  }
}
