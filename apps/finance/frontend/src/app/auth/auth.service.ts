import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, firstValueFrom, from, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { apiUrl } from '../core/api-url';
import { authNavigation } from './after-auth';
import { AuthUser, LoginResponse, MeResponse, SignupPolicy } from './auth.models';
import { FinanceService } from '../services/finance.service';
import { createSigningKey, signChallenge, usernameForStorage, WrappedSigningKey } from '@vivek/auth';
import { createVaultMaterial } from '../crypto/vault-crypto';
import { VaultService } from '../crypto/vault.service';
import { silentErrorToast } from '../core/http-error.interceptor';
import {
  USERNAME_CHANGE_CHALLENGE,
  USERNAME_CHANGE_LOOKUP,
  USERNAME_CHANGE_MISSING,
  UsernameChangeError,
} from './username-change';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private finance = inject(FinanceService);
  private vault = inject(VaultService);
  private userSubject = new BehaviorSubject<AuthUser | null>(null);
  private checkedSession = false;

  readonly user$ = this.userSubject.asObservable();

  get currentUser(): AuthUser | null {
    return this.userSubject.value;
  }

  get csrfToken(): string | null {
    return readCookie('finance_csrf');
  }

  isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  loadSession(): Observable<AuthUser | null> {
    if (this.checkedSession) {
      return of(this.currentUser);
    }
    // finance_session is httponly. The readable companion is finance_csrf,
    // which is only set for a signed-in browser. Skip the probe otherwise.
    if (!this.csrfToken) {
      this.checkedSession = true;
      this.userSubject.next(null);
      return of(null);
    }
    return this.http.get<MeResponse>(apiUrl('/auth/me'), { withCredentials: true }).pipe(
      switchMap(res => {
        // Production builds set localDevAuth false, so they never take this path.
        if (!res.local_dev || !environment.localDevAuth) return of(res);
        return from(this.vault.ensureLocalDevUnlocked()).pipe(
          map(() => res),
          // A vault error still leaves the local-dev session signed in.
          catchError(() => of(res))
        );
      }),
      tap(res => {
        this.checkedSession = true;
        // A reload still has the session cookie and the saved vault key.
        // Clearing here locked the vault on every refresh.
        this.userSubject.next(res.user);
      }),
      map(res => res.user),
      catchError((err: HttpErrorResponse) => {
        this.checkedSession = true;
        if (err.status === 401) this.finance.clearSessionState();
        this.userSubject.next(null);
        return of(null);
      })
    );
  }

  bootstrapStatus(): Observable<{ needs_setup: boolean }> {
    return this.http.get<{ needs_setup: boolean }>(apiUrl('/auth/bootstrap-status'), { withCredentials: true });
  }

  bootstrap(email: string, displayName: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(apiUrl('/auth/bootstrap'), { email, display_name: displayName, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          this.checkedSession = true;
          this.finance.clearSessionState();
          this.userSubject.next(res.user);
        }),
        map(res => res.user)
      );
  }

  async bootstrapPasswordless(username: string, displayName: string, vaultPassphrase: string): Promise<AuthUser> {
    const normalized = username.trim().toLowerCase();
    const vaultMaterial = await createVaultMaterial(vaultPassphrase);
    const signingMaterial = await createSigningKey(vaultPassphrase);
    const response = await this.http.post<LoginResponse>(apiUrl('/auth/bootstrap/passwordless'), {
      username: normalized,
      display_name: displayName.trim(),
      public_key_b64: signingMaterial.publicKeyB64,
      vault: vaultMaterial.setupPayload,
      auth: signingMaterial.wrapped,
    }, { withCredentials: true }).toPromise();
    if (!response) throw new Error('Unable to create passwordless account');
    this.checkedSession = true;
    this.finance.clearSessionState();
    await this.vault.adoptBootstrapVault(vaultMaterial.dek);
    this.userSubject.next(response.user);
    return response.user;
  }

  signupPolicy(): Promise<SignupPolicy> {
    return firstValueFrom(
      this.http.get<SignupPolicy>(apiUrl('/auth/signup-policy'), { withCredentials: true })
    );
  }

  /**
   * Self-signup when the server policy allows it. Signs in and unlocks the vault.
   */
  async signupPasswordless(username: string, vaultPassphrase: string, displayName = '', inviteCode = ''): Promise<AuthUser> {
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,64}$/.test(normalized)) {
      throw new Error('Username must be 3-64 letters, numbers, dots, underscores, or hyphens');
    }
    if (vaultPassphrase.length < 12) {
      throw new Error('Vault passphrase must be at least 12 characters');
    }
    const vaultMaterial = await createVaultMaterial(vaultPassphrase);
    const signingMaterial = await createSigningKey(vaultPassphrase);
    const response = await this.http
      .post<LoginResponse>(
        apiUrl('/auth/signup/passwordless'),
        {
          username: normalized,
          display_name: (displayName || normalized).trim(),
          public_key_b64: signingMaterial.publicKeyB64,
          vault: vaultMaterial.setupPayload,
          auth: signingMaterial.wrapped,
          invite_code: inviteCode,
        },
        { withCredentials: true }
      )
      .toPromise();
    if (!response) throw new Error('Unable to create account');
    this.checkedSession = true;
    this.finance.clearSessionState();
    await this.vault.adoptBootstrapVault(vaultMaterial.dek);
    this.userSubject.next(response.user);
    return response.user;
  }

  previewInvitation(token: string): Promise<{ username: string; display_name: string; expires_at: string }> {
    return firstValueFrom(
      this.http.get<{ username: string; display_name: string; expires_at: string }>(
        apiUrl(`/auth/invitations/${encodeURIComponent(token)}`),
        { withCredentials: true },
      ),
    );
  }

  /** Finish an admin enrollment link: passphrase only. The username is already chosen. */
  async enrollInvitation(token: string, vaultPassphrase: string): Promise<AuthUser> {
    if (vaultPassphrase.length < 12) {
      throw new Error('Vault passphrase must be at least 12 characters');
    }
    const vaultMaterial = await createVaultMaterial(vaultPassphrase);
    const signingMaterial = await createSigningKey(vaultPassphrase);
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(
        apiUrl(`/auth/invitations/${encodeURIComponent(token)}/enroll`),
        {
          public_key_b64: signingMaterial.publicKeyB64,
          vault: vaultMaterial.setupPayload,
          auth: signingMaterial.wrapped,
        },
        { withCredentials: true },
      ),
    );
    if (!response) throw new Error('Unable to finish enrollment');
    this.checkedSession = true;
    this.finance.clearSessionState();
    await this.vault.adoptBootstrapVault(vaultMaterial.dek);
    this.userSubject.next(response.user);
    return response.user;
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(apiUrl('/auth/login/migrate'), { email, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          this.checkedSession = true;
          this.finance.clearSessionState();
          this.userSubject.next(res.user);
        }),
        map(res => res.user)
      );
  }

  /**
   * One-time migration: after password migrate-login, enroll username + vault + signing key.
   */
  async enrollPasswordless(username: string, vaultPassphrase: string): Promise<void> {
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,64}$/.test(normalized)) {
      throw new Error('Username must be 3–64 characters: letters, numbers, underscore, dot, or hyphen.');
    }
    if (vaultPassphrase.length < 12) {
      throw new Error('Vault passphrase must be at least 12 characters.');
    }
    const vaultMaterial = await createVaultMaterial(vaultPassphrase);
    const signingMaterial = await createSigningKey(vaultPassphrase);
    try {
      await firstValueFrom(
        this.http.post(
          apiUrl('/auth/passwordless/enroll'),
          {
            username: normalized,
            public_key_b64: signingMaterial.publicKeyB64,
            vault: vaultMaterial.setupPayload,
            auth: signingMaterial.wrapped,
          },
          { withCredentials: true }
        )
      );
    } catch (err: any) {
      const detail = err?.error?.detail;
      if (typeof detail === 'string') throw new Error(detail);
      if (Array.isArray(detail) && detail.length) {
        throw new Error(
          detail
            .map((item: any) => {
              const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
              const message = item?.msg || 'Invalid value';
              return field ? `${field}: ${message}` : message;
            })
            .join('; ')
        );
      }
      throw new Error('Vault authentication enrollment failed. Try the migration again.');
    }
    await this.vault.adoptBootstrapVault(vaultMaterial.dek);
  }

  async loginWithVault(username: string, vaultPassphrase: string): Promise<AuthUser> {
    const identifier = username.trim().toLowerCase();
    const lookup = await firstValueFrom(
      this.http.post<{ auth: WrappedSigningKey }>(
        apiUrl('/auth/passwordless/lookup'),
        { username: identifier },
        { withCredentials: true }
      )
    );
    if (!lookup?.auth?.wrapped_private_key_b64 || !lookup.auth.kdf_salt_b64 || !lookup.auth.kdf_iterations) {
      throw new Error('Unable to retrieve vault authentication material');
    }
    // The same username is sent to challenge and verify. Email is not an alias.
    const handle = identifier;
    this.vault.loadAuthWrap(lookup.auth);
    const challenge = await this.requestPasswordlessChallenge(handle);
    let signature_b64: string;
    try {
      signature_b64 = await signChallenge(vaultPassphrase, lookup.auth, challenge.message);
    } catch {
      // Same failure shape for wrong passphrase and unknown username (decoy wraps).
      throw new Error(
        'Sign-in failed. Check your username, not your email, and your vault passphrase. ' +
          'A browser that is already signed in only needs the passphrase on Unlock vault—use that username on new browsers.'
      );
    }
    let response: LoginResponse;
    try {
      response = await firstValueFrom(
        this.http.post<LoginResponse>(
          apiUrl('/auth/passwordless/verify'),
          {
            username: handle,
            challenge_id: challenge.challenge_id,
            challenge: challenge.challenge,
            message: challenge.message,
            signature_b64,
          },
          { withCredentials: true }
        )
      );
    } catch (err: any) {
      const detail = err?.error?.detail;
      throw new Error(typeof detail === 'string' ? detail : 'Vault authentication failed');
    }
    this.checkedSession = true;
    this.finance.clearSessionState();
    this.userSubject.next(response.user);
    try {
      // DEK wraps are session-only. Fetch them after the signature check, then unlock.
      await this.vault.refreshStatus();
      await this.vault.unlock(vaultPassphrase);
    } catch {
      this.clearLocalSession();
      throw new Error('Vault authentication succeeded, but this passphrase cannot unlock the vault.');
    }
    // Another PBKDF2 pass. It must not delay navigation, and a failed upgrade must not log the user out.
    void this.vault.upgradeKdfIfNeeded(vaultPassphrase);
    return response.user;
  }

  /**
   * Rename the signed-in account. The passphrase unwraps the same signing key
   * login uses, signs the server's message, and is not kept after this returns.
   * A 403 refreshes the session once and runs this whole flow once more.
   */
  async changeUsername(requested: string, passphrase: string): Promise<AuthUser> {
    try {
      return await this.submitUsernameChange(requested, passphrase);
    } catch (err) {
      const mapped = this.asUsernameError(err);
      if (mapped.status !== 403) throw mapped;
      const refreshed = await this.refreshCsrf();
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
  private async refreshCsrf(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.get<MeResponse>(apiUrl('/auth/me'), { withCredentials: true, context: silentErrorToast() })
      );
      if (res?.user) {
        this.checkedSession = true;
        this.userSubject.next(res.user);
      }
      return !!res?.user && !!this.csrfToken;
    } catch {
      return false;
    }
  }

  private warnUsernameStep(step: 'missing username' | 'lookup' | 'challenge' | 'signing', status: number): void {
    console.warn(`username change: ${step}`, { status });
  }

  private async submitUsernameChange(requested: string, passphrase: string): Promise<AuthUser> {
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
    try {
      signature_b64 = await signChallenge(passphrase, lookup.auth, challenge.message);
    } catch {
      this.warnUsernameStep('signing', 401);
      throw new UsernameChangeError(401);
    }
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
    const user: AuthUser = { ...(this.currentUser as AuthUser), ...updated };
    this.userSubject.next(user);
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

  logout(): void {
    this.http.post(apiUrl('/auth/logout'), {}, { withCredentials: true }).subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout(),
    });
  }

  clearLocalSession(): void {
    this.checkedSession = true;
    this.finance.clearSessionState();
    this.vault.lock();
    this.userSubject.next(null);
  }

  private finishLogout(): void {
    this.clearLocalSession();
    authNavigation.goToLogin(false);
  }
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}
