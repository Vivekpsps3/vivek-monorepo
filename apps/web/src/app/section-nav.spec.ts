import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UiSectionNavComponent, type UiSectionNavItem } from '@vivek/ui';
import { MediaComponent } from '../../../media/frontend/src/media.component';
import { TravelLayoutComponent } from '../../../travel/frontend/src/travel-layout.component';

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

  async function currentAt(url: string): Promise<string[]> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(UiSectionNavComponent);
    fixture.componentRef.setInput('label', 'Sections');
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
    const current = [...fixture.nativeElement.querySelectorAll('a')]
      .filter(link => link.getAttribute('aria-current') === 'page')
      .map(link => (link.textContent ?? '').trim());
    const add = fixture.nativeElement.querySelector('a[href="/media/add"]') as HTMLAnchorElement | null;
    expect(add?.getAttribute('aria-label')).toBe('Add manually');
    expect(add?.querySelector('.ui-section-nav__short')?.textContent).toBe('Add');
    return current;
  }

  it('keeps Trips current on a trip page and Library current on an item page', async () => {
    expect(new TravelLayoutComponent().sections[0]).toEqual({ label: 'Trips', link: '/travel', exact: true, also: ['/travel/trips'] });
    expect(new MediaComponent().sections.find(section => section.link === '/media/library')?.also).toEqual(['/media/item']);
    expect(await currentAt('/travel/trips/9')).toEqual(['Trips']);
    expect(await currentAt('/travel/calendar')).toEqual(['Calendar']);
    expect(await currentAt('/media/item/3')).toEqual(['Library']);
    expect(await currentAt('/media/search')).toEqual(['Search']);
  });
});
