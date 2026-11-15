import { ComponentFixture,TestBed } from '@angular/core/testing';
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
