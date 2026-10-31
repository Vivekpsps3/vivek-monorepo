import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UiSectionNavComponent, type UiSectionNavItem } from '@vivek/ui';
import { routes as mediaRoutes } from '../../../media/frontend/src/public-api';
import { routes as travelRoutes } from '../../../travel/frontend/src/public-api';

@Component({ standalone: true, template: '' })
class Blank {}

describe('section nav', () => {
  const items: UiSectionNavItem[] = [
    { label: 'Trips', link: '/travel', exact: true, also: ['/travel/trips'] },
    { label: 'Calendar', link: '/travel/calendar' },
    { label: 'Library', link: '/media/library', also: ['/media/item'] },
    { label: 'Search', link: '/media/search' },
    { label: 'Add manually', shortLabel: 'Add', ariaLabel: 'Add manually', link: '/media/add' },
  ];

  it('keeps one bar current across trips, calendar, items, and search', async () => {
    const travelLayout = travelRoutes[0].component;
    const mediaLayout = mediaRoutes[0].component;
    if (!travelLayout || !mediaLayout) throw new Error('section layouts are missing from the public routes');
    expect(new travelLayout().sections[0]).toEqual({ label: 'Trips', link: '/travel', exact: true, also: ['/travel/trips'] });
    expect(new mediaLayout().sections.find((section: UiSectionNavItem) => section.link === '/media/library')?.also).toEqual(['/media/item']);
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Blank }])] });
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(UiSectionNavComponent);
    fixture.componentRef.setInput('label', 'Sections');
    fixture.componentRef.setInput('items', items);
    const current = async (url: string) => {
      await router.navigateByUrl(url);
      fixture.detectChanges();
      const add = fixture.nativeElement.querySelector('a[href="/media/add"]') as HTMLAnchorElement | null;
      expect(add?.getAttribute('aria-label')).toBe('Add manually');
      expect(add?.querySelector('.ui-section-nav__short')?.textContent).toBe('Add');
      return [...fixture.nativeElement.querySelectorAll('a')].filter(link => link.getAttribute('aria-current') === 'page').map(link => (link.textContent ?? '').trim());
    };
    expect(await current('/travel/trips/9')).toEqual(['Trips']);
    expect(await current('/travel/calendar')).toEqual(['Calendar']);
    expect(await current('/media/item/3')).toEqual(['Library']);
    expect(await current('/media/search')).toEqual(['Search']);
  });
});
