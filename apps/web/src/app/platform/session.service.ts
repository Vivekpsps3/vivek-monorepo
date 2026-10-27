import { DestroyRef, Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, Observable, catchError, firstValueFrom, from, map, of, tap, switchMap, finalize, shareReplay, timeout } from 'rxjs';
import { signChallenge, usernameForStorage, type WrappedSigningKey, type SessionUser } from '@vivek/auth';
import { silentErrorToast } from '@vivek/ui';
import { authNavigation } from '@vivek/ui';
import { clearFinanceSessionStorage } from '../../../../finance/frontend/src/public-api';
import { USERNAME_CHANGE_CHALLENGE, USERNAME_CHANGE_LOOKUP, USERNAME_CHANGE_MISSING, UsernameChangeError } from './auth/username-change';

const apiUrl = (path: string) => `/api${path}`;
type AuthUser = SessionUser;
interface MeResponse { user: SessionUser; csrf_token?: string | null; local_dev?: boolean; }

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly userSubject = new BehaviorSubject<SessionUser | null>(null);
  checkedSession = false;
  private epoch = 0;
  private probe?: Observable<SessionUser | null>;
  get revision(): number { return this.epoch; }
  private readonly cleared = new Subject<void>();
  readonly cleared$ = this.cleared.asObservable();
  readonly user$ = this.userSubject.asObservable();
  constructor() {
    if (typeof window === 'undefined') return;
    const ended = (event: StorageEvent) => {
      if (event.key === 'suite-session-ended' && event.newValue) {
        this.clearLocalSession(false);
        authNavigation.goToLogin(false);
      }
    };
    window.addEventListener('storage', ended);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', ended));
  }
  get currentUser(): SessionUser | null { return this.userSubject.value; }
  get csrfToken(): string | null {
    if (typeof document === 'undefined') return null;
    return document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith('finance_csrf='))?.slice('finance_csrf='.length) ?? null;
  }
  isAdmin(): boolean { return this.currentUser?.role === 'admin'; }
  loadSession(afterLocalDev?: () => Promise<void>): Observable<SessionUser | null> {
    if (this.checkedSession) return of(this.currentUser);
    if (this.probe) return this.probe;
    if (!this.csrfToken) { this.checkedSession = true; return of(null); }
    const epoch = this.epoch;
    this.probe = this.http.get<MeResponse>('/api/auth/me', { withCredentials: true, context: silentErrorToast() }).pipe(
      timeout(5000),
      switchMap(res => res.local_dev && afterLocalDev
        ? from(afterLocalDev()).pipe(map(() => res), catchError(() => of(res)))
        : of(res)),
      tap(res => { if (epoch === this.epoch) { this.checkedSession = true; this.acceptUser(res.user); } }),
      map(res => this.currentUser?.id === res.user.id ? this.currentUser : null),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && epoch === this.epoch) this.clearLocalSession();
        return of(null);
      }),
      finalize(() => { this.probe = undefined; }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.probe;
  }
  acceptUser(user: SessionUser): void {
    this.epoch += 1;
    if (this.currentUser && this.currentUser.id !== user.id) {
      this.resetDomainState();
    }
    this.checkedSession = true;
    this.userSubject.next(user);
  }
  resetDomainState(): void {
    clearFinanceSessionStorage();
    this.cleared.next();
  }
  clearLocalSession(announce = true): void {
    this.epoch += 1;
    this.checkedSession = true;
    this.resetDomainState();
    this.userSubject.next(null);
    if (announce) {
      try { localStorage.setItem('suite-session-ended', `${Date.now()}:${Math.random()}`); } catch { /* private mode */ }
    }
  }
  logout(): void {
    this.clearLocalSession();
    const epoch = this.epoch;
    const finish = () => {
      if (this.epoch === epoch) authNavigation.goToLogin(false);
    };
    this.http.post('/api/auth/logout', {}, { withCredentials: true }).subscribe({
      next: finish,
      error: finish,
    });
  }
  async updateDisplayName(displayName: string): Promise<AuthUser> {
    const epoch = this.epoch;
    const name = displayName.trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('Enter a name.');
    if (name.length > 160) throw new Error('Name must be 160 characters or fewer.');
    const updated = await firstValueFrom(
      this.http.patch<AuthUser>(apiUrl('/account/name'), { display_name: name }, { withCredentials: true }),
    );
    this.requireCurrentSession(epoch);
    const user: AuthUser = { ...(this.currentUser as AuthUser), ...updated };
    this.acceptUser(user);
    return user;
  }

  async changeUsername(requested: string, passphrase: string): Promise<AuthUser> {
    const epoch = this.epoch;
    try {
      return await this.submitUsernameChange(requested, passphrase);
    } catch (err) {
      const mapped = this.asUsernameError(err);
      if (mapped.status !== 403) throw mapped;
      this.requireCurrentSession(epoch);
      const refreshed = await this.refreshCsrf(epoch);
      if (!refreshed) throw mapped;
      try {
        return await this.submitUsernameChange(requested, passphrase);
      } catch (retryErr) {
        throw this.asUsernameError(retryErr);
      }
    }
  }

  private asUsernameError(err: unknown): UsernameChangeError {
    if (err instanceof UsernameChangeError) return err;
    if (err instanceof HttpErrorResponse) {
      const detail = err.error && typeof err.error === 'object' ? err.error.detail : undefined;
      return new UsernameChangeError(err.status, detail);
    }
    return new UsernameChangeError(0);
  }

  /** Re-read the session so a stale CSRF cookie can be replaced, then the caller retries once. */
  private async refreshCsrf(epoch: number): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.get<MeResponse>(apiUrl('/auth/me'), { withCredentials: true, context: silentErrorToast() })
      );
      this.requireCurrentSession(epoch);
      if (res?.user && res.user.id === this.currentUser?.id) {
        this.checkedSession = true;
        this.userSubject.next(res.user);
        return !!this.csrfToken;
      }
      return false;
    } catch {
      return false;
    }
  }

  private warnUsernameStep(step: 'missing username' | 'lookup' | 'challenge' | 'signing', status: number): void {
    console.warn(`username change: ${step}`, { status });
  }

  private async submitUsernameChange(requested: string, passphrase: string): Promise<AuthUser> {
    const epoch = this.epoch;
    const username = usernameForStorage(requested);
    if (!username) throw new UsernameChangeError(400);
    if (!passphrase) throw new UsernameChangeError(0);
    // The signed-in name is whatever the account already uses, including a legacy email.
    // The new-name rule applies only to `requested`.
    const current = this.currentUser?.username ?? '';
    if (!current.trim()) {
      this.warnUsernameStep('missing username', 0);
      throw new UsernameChangeError(0, undefined, USERNAME_CHANGE_MISSING);
    }

    let lookup: { auth: WrappedSigningKey };
    try {
      lookup = await firstValueFrom(
        this.http.post<{ auth: WrappedSigningKey }>(
          apiUrl('/auth/passwordless/lookup'),
          { username: current },
          { withCredentials: true, context: silentErrorToast() }
        )
      );
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      this.warnUsernameStep('lookup', status);
      throw err;
    }
    this.requireCurrentSession(epoch);
    if (!lookup?.auth?.wrapped_private_key_b64 || !lookup.auth.kdf_salt_b64 || !lookup.auth.kdf_iterations) {
      this.warnUsernameStep('lookup', 0);
      throw new UsernameChangeError(0, undefined, USERNAME_CHANGE_LOOKUP);
    }
    let challenge: { challenge_id: string; challenge: string; message: string };
    try {
      challenge = await this.requestPasswordlessChallenge(current, 'username_change');
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        this.warnUsernameStep('challenge', err.status);
        throw err;
      }
      this.warnUsernameStep('challenge', 0);
      throw new UsernameChangeError(0, undefined, USERNAME_CHANGE_CHALLENGE);
    }
    let signature_b64: string;
    this.requireCurrentSession(epoch);
    try {
      signature_b64 = await signChallenge(passphrase, lookup.auth, challenge.message);
    } catch {
      this.warnUsernameStep('signing', 401);
      throw new UsernameChangeError(401);
    }
    this.requireCurrentSession(epoch);
    const updated = await firstValueFrom(
      this.http.patch<AuthUser>(
        apiUrl('/account/username'),
        {
          username,
          challenge_id: challenge.challenge_id,
          challenge: challenge.challenge,
          message: challenge.message,
          signature_b64,
        },
        { withCredentials: true, context: silentErrorToast() }
      )
    );
    this.requireCurrentSession(epoch);
    const user: AuthUser = { ...(this.currentUser as AuthUser), ...updated };
    this.acceptUser(user);
    return user;
  }

  private async requestPasswordlessChallenge(
    username: string,
    purpose?: 'username_change',
  ): Promise<{ challenge_id: string; challenge: string; message: string }> {
    const challenge = await firstValueFrom(
      this.http.post<{ challenge_id: string; challenge: string; message: string }>(
        apiUrl('/auth/passwordless/challenge'),
        purpose ? { username, purpose } : { username },
        purpose
          ? { withCredentials: true, context: silentErrorToast() }
          : { withCredentials: true },
      )
    );
    if (!challenge?.challenge_id || !challenge?.message) {
      throw new Error('Unable to request vault authentication challenge');
    }
    return challenge;
  }

  private requireCurrentSession(epoch: number): void {
    if (epoch !== this.epoch || !this.currentUser) {
      throw new UsernameChangeError(403);
    }
  }

}
