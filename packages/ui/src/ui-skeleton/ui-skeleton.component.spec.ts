import { TestBed } from '@angular/core/testing';
import { UiSkeletonComponent } from './ui-skeleton.component';

describe('UiSkeletonComponent', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('shimmers with the skeleton tones, lightened in dark mode (B0F2 P5)', () => {
    TestBed.configureTestingModule({ imports: [UiSkeletonComponent] });
    const fixture = TestBed.createComponent(UiSkeletonComponent);
    fixture.detectChanges();
    const block = fixture.nativeElement.querySelector('.ui-skeleton__block') as HTMLElement | null;
    expect(block).not.toBeNull();

    document.documentElement.dataset['theme'] = 'light';
    const light = getComputedStyle(block!).backgroundImage;
    expect(light).toContain('rgb(239, 234, 227)');
    expect(light).toContain('rgb(231, 224, 214)');

    document.documentElement.dataset['theme'] = 'dark';
    const dark = getComputedStyle(block!).backgroundImage;
    expect(dark).toContain('rgb(48, 44, 37)');
    expect(dark).toContain('rgb(61, 55, 45)');
    expect(dark).not.toContain('rgb(40, 37, 31)');
  });
});
