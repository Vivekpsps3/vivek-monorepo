import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { VaultService } from '../crypto/vault.service';
import { VaultUnlockComponent } from './vault-unlock.component';

describe('VaultUnlockComponent', () => {
  it('starts a KDF upgrade after unlock without waiting for it', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['loadSession']);
    auth.currentUser = { username: 'vivek', email: 'vivek@pending.local' };
    const vault = jasmine.createSpyObj('VaultService', ['refreshStatus', 'unlock', 'upgradeKdfIfNeeded']);
    vault.isUnlocked = false;
    vault.refreshStatus.and.resolveTo({ exists: true });
    vault.unlock.and.resolveTo();
    vault.upgradeKdfIfNeeded.and.returnValue(new Promise(() => undefined));

    TestBed.configureTestingModule({
      imports: [VaultUnlockComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: VaultService, useValue: vault },
        provideRouter([]),
      ],
    });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const fixture: ComponentFixture<VaultUnlockComponent> = TestBed.createComponent(VaultUnlockComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.passphrase = 'correct horse battery staple';
    await fixture.componentInstance.unlock();

    expect(vault.unlock).toHaveBeenCalledWith('correct horse battery staple');
    expect(vault.upgradeKdfIfNeeded).toHaveBeenCalledWith('correct horse battery staple');
    expect(router.navigateByUrl).toHaveBeenCalled();
    expect(fixture.componentInstance.busy).toBeFalse();
  });
});