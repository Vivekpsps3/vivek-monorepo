import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { EcdhService } from '../../services/ecdh.service';

import { SecretsComponent } from './secrets.component';

describe('SecretsComponent', () => {
  let component: SecretsComponent;
  let fixture: ComponentFixture<SecretsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecretsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SecretsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows decrypted text as escaped text', () => {
    component.decryptedMessage = '<img src=x onerror=alert(1)>';
    fixture.detectChanges();
    const node = fixture.nativeElement.querySelector('.decrypted-message');
    expect(node.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(node.querySelector('img')).toBeNull();
  });

  it('encrypts and decrypts without losing typed text', async () => {
    component.message = 'A message long enough to exercise the ciphertext preview.';
    await component.encryptMessage();
    expect(component.isEncrypting).toBeFalse();
    expect(component.displayCiphertext()).toContain('bytes)');
    await component.decryptMessage();
    expect(component.decryptedMessage).toBe(component.message);
    expect(component.isDecrypting).toBeFalse();
    expect(component.errorMessage).toBe('');
  });

  it('explains missing input and ciphertext', async () => {
    await component.encryptMessage();
    expect(component.errorMessage).toContain('enter a message');
    await component.decryptMessage();
    expect(component.errorMessage).toContain('No encrypted data');
    expect(component.displayCiphertext()).toBe('No ciphertext available');
  });

  it('keeps input and reports encryption failures locally', async () => {
    spyOn(TestBed.inject(EcdhService), 'encryptMessage').and.rejectWith(new Error('Unavailable'));
    component.message = 'Keep this text';
    await component.encryptMessage();
    expect(component.message).toBe('Keep this text');
    expect(component.errorMessage).toBe('Encryption failed: Unavailable');
    expect(component.isEncrypting).toBeFalse();
  });

  it('rejects a damaged message without displaying stale decrypted text', async () => {
    component.encryptedData = { iv: [], tag: [], ciphertext: [] };
    component.decryptedMessage = 'stale';
    await component.decryptMessage();
    expect(component.decryptedMessage).toBe('');
    expect(component.errorMessage).toContain('Decryption failed');
    expect(component.isDecrypting).toBeFalse();
  });
});

describe('Encryption demo prerender', () => {
  it('renders without starting browser key generation', async () => {
    await TestBed.configureTestingModule({
      imports: [SecretsComponent], providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    }).compileComponents();
    const service = TestBed.inject(EcdhService);
    const initialize = spyOn(service, 'whenReady').and.resolveTo();
    const fixture = TestBed.createComponent(SecretsComponent);
    fixture.detectChanges();
    expect(initialize).not.toHaveBeenCalled();
    expect(service.isKeyExchangeComplete()).toBeFalse();
  });
});
