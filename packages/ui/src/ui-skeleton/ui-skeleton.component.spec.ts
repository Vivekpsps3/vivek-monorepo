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
    expect(light).toContain('rgb(238, 229, 214)');
    expect(light).toContain('rgb(227, 215, 195)');

    document.documentElement.dataset['theme'] = 'dark';
    const dark = getComputedStyle(block!).backgroundImage;
    expect(dark).toContain('rgb(43, 70, 80)');
    expect(dark).toContain('rgb(55, 84, 98)');
    expect(dark).not.toContain('rgb(29, 50, 61)');
  });
});
