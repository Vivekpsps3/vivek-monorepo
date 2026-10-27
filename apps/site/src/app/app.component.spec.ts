import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Meta } from '@angular/platform-browser';
import { routes } from './app.routes';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('offers one workspace path', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const links = [...fixture.nativeElement.querySelectorAll('a')].filter(
      (link: HTMLAnchorElement) => link.getAttribute('href') === '/hub',
    );
    expect(links.length).toBe(1);
    expect(links[0].textContent.trim()).toBe('Workspace');
  });

  it('updates search and social descriptions after public navigation', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/work');
    fixture.detectChanges();
    const meta = TestBed.inject(Meta);
    expect(meta.getTag('property="og:title"')?.content).toBe('Work · Vivek Panchagnula');
    expect(meta.getTag('name="description"')?.content).toContain('Selected work');
    await router.navigateByUrl('/about');
    fixture.detectChanges();
    expect(meta.getTag('property="og:title"')?.content).toBe('About · Vivek Panchagnula');
    expect(meta.getTag('property="og:description"')?.content).toContain('Experience');
  });

  it('applies and persists the selected theme', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTheme('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('suite-theme')).toBe('dark');
    fixture.componentInstance.setTheme('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
