import { ComponentFixture, TestBed } from '@angular/core/testing';

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
});
