import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { Subscription } from 'rxjs';

/** Resolve version.json against <base href>, so / and /finance/ both hit the built manifest. */
export function releaseManifestUrl(doc: Document): string {
  const base = doc.querySelector('base')?.href || doc.baseURI;
  return new URL('version.json', base).href;
}
const CHECK_THROTTLE_MS = 30_000;
const RELEASE_ID_PATTERN = /^[a-f0-9]{64}$/i;

interface ReleaseManifest {
  release: string;
}

@Injectable({ providedIn: 'root' })
export class ReleaseFreshnessService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private routerSubscription?: Subscription;
  private started = false;
  private lastCheckAt = 0;
  private inFlight?: Promise<void>;

  readonly loadedRelease = this.document
    .querySelector<HTMLMetaElement>('meta[name="app-release"]')
    ?.content.trim() || null;
  readonly loadedReleaseLabel = this.loadedRelease?.slice(0, 12) ?? null;
  readonly latestRelease = signal<string | null>(null);
  readonly updateAvailable = signal(false);
  readonly chunkLoadFailure = signal(false);
  readonly noticeVisible = signal(false);

  start(): void {
    if (this.started) return;
    this.started = true;
    this.routerSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        void this.checkForUpdate();
      } else if (event instanceof NavigationError && isLazyChunkFailure(event.error)) {
        this.chunkLoadFailure.set(true);
        this.noticeVisible.set(true);
        void this.checkForUpdate(true);
      }
    });
    window.addEventListener('focus', this.onFocus);
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
    void this.checkForUpdate(true);
  }

  async checkForUpdate(force = false): Promise<void> {
    if (!this.loadedRelease) return;
    if (this.inFlight) return this.inFlight;
    const now = Date.now();
    if (!force && now - this.lastCheckAt < CHECK_THROTTLE_MS) return;

    this.lastCheckAt = now;
    this.inFlight = this.fetchManifest()
      .then((manifest) => {
        if (!manifest) return;
        const hadUpdate = this.updateAvailable();
        this.latestRelease.set(manifest.release);
        const hasUpdate = manifest.release !== this.loadedRelease;
        this.updateAvailable.set(hasUpdate);
        if (hasUpdate && !hadUpdate) this.noticeVisible.set(true);
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  dismissNotice(): void {
    this.noticeVisible.set(false);
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
    window.removeEventListener('focus', this.onFocus);
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  reload(): void {
    window.location.reload();
  }

  private readonly onFocus = (): void => {
    void this.checkForUpdate();
  };

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'visible') void this.checkForUpdate();
  };

  private async fetchManifest(): Promise<ReleaseManifest | null> {
    try {
      const response = await fetch(releaseManifestUrl(this.document), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (!isReleaseManifest(body)) return null;
      return body;
    } catch {
      // Offline or transient failures are unknown state, never evidence of an update.
      return null;
    }
  }
}

function isReleaseManifest(value: unknown): value is ReleaseManifest {
  return typeof value === 'object'
    && value !== null
    && 'release' in value
    && typeof value.release === 'string'
    && RELEASE_ID_PATTERN.test(value.release);
}

function isLazyChunkFailure(error: unknown): boolean {
  const details = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error ?? '');
  return /chunkloaderror|loading\s+(?:css\s+)?chunk|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|failed to load module script/i.test(details);
}
