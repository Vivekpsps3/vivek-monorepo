import { SessionService } from '../session.service';
import { environment } from '../../../environments/environment';
import { createFinanceVaultMaterial } from '../../../../../finance/frontend/src/public-api';
import { Injectable, Injector, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom, map, tap } from 'rxjs';

const apiUrl = (path: string) => `/api${path}`;
import { AuthUser, LoginResponse, SignupPolicy } from './auth.models';
import { createSigningKey, signChallenge, WrappedSigningKey } from '@vivek/auth';
import { silentErrorToast } from '@vivek/ui';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly injector = inject(Injector);
  private readonly session = inject(SessionService);
  private get checkedSession(): boolean { return this.session.checkedSession; }
  private set checkedSession(value: boolean) { this.session.checkedSession = value; }
  private async financeVault() { return (await import('../../../../../finance/frontend/src/public-api')).openFinanceVault(this.injector); }


  readonly user$ = this.session.user$;

  get currentUser(): AuthUser | null {
    return this.session.currentUser;
  }

  get csrfToken(): string | null {
    return this.session.csrfToken;
  }

  isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  loadSession(): Observable<AuthUser | null> { return this.session.loadSession(environment.localDevAuth ? async () => { await (await this.financeVault()).ensureLocalDevUnlocked(); } : undefined); }

  bootstrapStatus(): Observable<{ needs_setup: boolean }> {
    return this.http.get<{ needs_setup: boolean }>(apiUrl('/auth/bootstrap-status'), { withCredentials: true });
  }

  bootstrap(email: string, displayName: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(apiUrl('/auth/bootstrap'), { email, display_name: displayName, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          this.checkedSession = true;
          this.session.resetDomainState();
          this.session.acceptUser(res.user);
        }),
        map(res => res.user)
      );
  }

  async bootstrapPasswordless(username: string, displayName: string, vaultPassphrase: string): Promise<AuthUser> {
    const normalized = username.trim().toLowerCase();
    const vaultMaterial = await createFinanceVaultMaterial(vaultPassphrase);
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
    await this.session.resetDomainState();
    this.session.acceptUser(response.user);
    await (await this.financeVault()).adoptBootstrapVault(vaultMaterial.dek);
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
    const vaultMaterial = await createFinanceVaultMaterial(vaultPassphrase);
    const signingMaterial = await createSigningKey(vaultPassphrase);
    const response = await this.http
      .post<LoginResponse>(
        apiUrl('/auth/signup/passwordless'),
        {
          username: normalized,
          display_name: displayName.trim().replace(/\s+/g, ' '),
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
    await this.session.resetDomainState();
    this.session.acceptUser(response.user);
    await (await this.financeVault()).adoptBootstrapVault(vaultMaterial.dek);
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
    const vaultMaterial = await createFinanceVaultMaterial(vaultPassphrase);
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
    await this.session.resetDomainState();
    this.session.acceptUser(response.user);
    await (await this.financeVault()).adoptBootstrapVault(vaultMaterial.dek);
    return response.user;
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(apiUrl('/auth/login/migrate'), { email, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          this.checkedSession = true;
          this.session.resetDomainState();
          this.session.acceptUser(res.user);
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
    const vaultMaterial = await createFinanceVaultMaterial(vaultPassphrase);
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
    await (await this.financeVault()).adoptBootstrapVault(vaultMaterial.dek);
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
    (await this.financeVault()).loadAuthWrap(lookup.auth);
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
    this.session.resetDomainState();
    this.session.acceptUser(response.user);
    try {
      // DEK wraps are session-only. Fetch them after the signature check; unlock records the epoch first.
      await (await this.financeVault()).unlock(vaultPassphrase, true);
    } catch {
      this.clearLocalSession();
      throw new Error('Vault authentication succeeded, but this passphrase cannot unlock the vault.');
    }
    // Another PBKDF2 pass. It must not delay navigation, and a failed upgrade must not log the user out.
    void (await this.financeVault()).upgradeKdfIfNeeded(vaultPassphrase);
    return response.user;
  }

  /**
   * Rename the signed-in account. The passphrase unwraps the same signing key
   * login uses, signs the server's message, and is not kept after this returns.
   * A 403 refreshes the session once and runs this whole flow once more.
   */
  readonly updateDisplayName = this.session.updateDisplayName.bind(this.session);
  readonly changeUsername = this.session.changeUsername.bind(this.session);

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

  logout(): void { void this.session.logout().catch(() => undefined); }
  clearLocalSession(): Promise<void> { return this.session.clearLocalSession(); }
}
