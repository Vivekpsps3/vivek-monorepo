import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter,Router } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
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

});
