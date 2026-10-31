import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SESSION_CONTEXT } from '@vivek/ui';
import { VaultService } from '../crypto/vault.service';
import { VaultUnlockComponent } from './vault-unlock.component';

describe('VaultUnlockComponent', () => {
  it('starts a KDF upgrade after unlock without waiting for it', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['loadSession']);
    auth.currentUser = { username: 'vivek', email: 'vivek@pending.local' };
    const vault = jasmine.createSpyObj('VaultService', ['refreshStatus', 'unlock', 'upgradeKdfIfNeeded']);
    vault.isUnlocked = false;
    vault.refreshStatus.and.resolveTo({ exists: true });
    vault.unlock.and.callFake(async () => { vault.isUnlocked = true; return true; });
    vault.upgradeKdfIfNeeded.and.returnValue(new Promise(() => undefined));

    TestBed.configureTestingModule({
      imports: [VaultUnlockComponent],
      providers: [
        { provide: SESSION_CONTEXT, useValue: auth },
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

    expect(fixture.nativeElement.querySelector('.nav-tab, .mobile-tab')).toBeNull();
    expect(vault.unlock).toHaveBeenCalledWith('correct horse battery staple');
    expect(vault.upgradeKdfIfNeeded).toHaveBeenCalledWith('correct horse battery staple');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/finance/embed');
    expect(fixture.componentInstance.busy).toBeFalse();
  });

  it('keeps the passphrase when unlock fails', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['loadSession']);
    auth.currentUser = { username: 'vivek', email: 'vivek@pending.local' };
    const vault = jasmine.createSpyObj('VaultService', ['refreshStatus', 'unlock', 'upgradeKdfIfNeeded']);
    vault.isUnlocked = false;
    vault.refreshStatus.and.resolveTo({ exists: true });
    vault.unlock.and.rejectWith(new Error('Unlock failed'));

    TestBed.configureTestingModule({
      imports: [VaultUnlockComponent],
      providers: [
        { provide: SESSION_CONTEXT, useValue: auth },
        { provide: VaultService, useValue: vault },
        provideRouter([]),
      ],
    });
    const fixture: ComponentFixture<VaultUnlockComponent> = TestBed.createComponent(VaultUnlockComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.passphrase = 'correct horse battery staple';
    await fixture.componentInstance.unlock();

    expect(fixture.componentInstance.passphrase).toBe('correct horse battery staple');
    expect(fixture.componentInstance.error).toBe('Unlock failed');
    expect(vault.upgradeKdfIfNeeded).not.toHaveBeenCalled();
  });

  it('stays on the unlock form when the vault discards the unlock', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['loadSession']);
    auth.currentUser = { username: 'vivek' };
    const vault = jasmine.createSpyObj('VaultService', ['refreshStatus', 'unlock', 'upgradeKdfIfNeeded']);
    vault.isUnlocked = false;
    vault.refreshStatus.and.resolveTo({ exists: true });
    vault.unlock.and.resolveTo(false);
    TestBed.configureTestingModule({ imports: [VaultUnlockComponent], providers: [
      { provide: SESSION_CONTEXT, useValue: auth }, { provide: VaultService, useValue: vault }, provideRouter([]),
    ] });
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(VaultUnlockComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.passphrase = 'correct horse battery staple';
    await fixture.componentInstance.unlock();
    expect(vault.upgradeKdfIfNeeded).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error).toBe('');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });
});
