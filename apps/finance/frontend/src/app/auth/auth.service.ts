import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, firstValueFrom, map, of, tap } from 'rxjs';
import { apiUrl } from '../core/api-url';
import { authNavigation } from './after-auth';
import { AuthUser, LoginResponse, MeResponse } from './auth.models';
import { FinanceService } from '../services/finance.service';
import { createSigningKey, signChallenge, WrappedSigningKey } from '@vivek/auth';
import { createVaultMaterial } from '../crypto/vault-crypto';
import { VaultService } from '../crypto/vault.service';

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
    return this.http.get<MeResponse>(apiUrl('/auth/me'), { withCredentials: true }).pipe(
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

  /**
   * Open self-signup: username + vault passphrase (no invitation).
   * Signs in and unlocks vault immediately.
   */
  async signupPasswordless(username: string, vaultPassphrase: string, displayName = ''): Promise<AuthUser> {
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
      this.http.post<{
        vault: import('../crypto/vault.service').VaultStatus & { username?: string | null };
        auth: WrappedSigningKey;
      }>(apiUrl('/auth/passwordless/lookup'), { username: identifier }, { withCredentials: true })
    );
    if (
      !lookup?.vault?.wrapped_dek_b64 ||
      !lookup?.auth?.wrapped_private_key_b64 ||
      !lookup.auth.kdf_salt_b64 ||
      !lookup.auth.kdf_iterations
    ) {
      throw new Error('Unable to retrieve vault authentication material');
    }
    // Prefer server-resolved username (lookup accepts username or legacy email).
    const handle = (lookup.vault.username || identifier).trim().toLowerCase();
    // Lookup returns public wraps only; mark the vault as present so unlock works on a new browser.
    this.vault.loadPublicStatus({
      exists: true,
      migration_status: lookup.vault.migration_status ?? 'complete',
      migrated: lookup.vault.migrated ?? true,
      kdf_algorithm: lookup.vault.kdf_algorithm ?? 'PBKDF2',
      kdf_salt_b64: lookup.vault.kdf_salt_b64,
      kdf_iterations: lookup.vault.kdf_iterations,
      wrapped_dek_b64: lookup.vault.wrapped_dek_b64,
      recovery_wrapped_dek_b64: lookup.vault.recovery_wrapped_dek_b64,
      key_version: lookup.vault.key_version ?? 1,
    });
    this.vault.loadAuthWrap(lookup.auth);
    const challenge = await firstValueFrom(
      this.http.post<{ challenge_id: string; challenge: string; message: string }>(
        apiUrl('/auth/passwordless/challenge'),
        { username: handle },
        { withCredentials: true }
      )
    );
    if (!challenge?.challenge_id || !challenge?.message) {
      throw new Error('Unable to request vault authentication challenge');
    }
    let signature_b64: string;
    try {
      signature_b64 = await signChallenge(vaultPassphrase, lookup.auth, challenge.message);
    } catch {
      // Same failure shape for wrong passphrase and unknown username (decoy wraps).
      throw new Error(
        'Sign-in failed. Check username (not email, unless that is your enrolled username) and vault passphrase. ' +
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
      await this.vault.unlock(vaultPassphrase);
    } catch {
      this.clearLocalSession();
      throw new Error('Vault authentication succeeded, but this passphrase cannot unlock the vault.');
    }
    return response.user;
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
