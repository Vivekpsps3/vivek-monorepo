import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UiSectionNavComponent, type UiSectionNavItem } from '@vivek/ui';
import { financeSections } from '../../../finance/frontend/src/public-api';
import { mediaSections, routes as mediaRoutes } from '../../../media/frontend/src/public-api';
import { travelSections, routes as travelRoutes } from '../../../travel/frontend/src/public-api';

@Component({ standalone: true, template: '' })
class Blank {}

describe('section nav', () => {
  it('uses the app-owned destinations in the local layouts', () => {
    const travelLayout = travelRoutes[0].component;
    const mediaLayout = mediaRoutes[0].component;
    if (!travelLayout || !mediaLayout) throw new Error('section layouts are missing from the public routes');
    expect(new travelLayout().sections).toBe(travelSections);
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Blank }])] });
    const media = TestBed.createComponent(mediaLayout);
    expect(media.componentInstance.sections).toBe(mediaSections);
  });

  it('keeps compatible library query on collection links and leaves All items clean', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Blank }])] });
    const router = TestBed.inject(Router);
    const mediaLayout = mediaRoutes[0].component;
    if (!mediaLayout) throw new Error('media layout missing');
    await router.navigateByUrl('/media/library?kind=artist&status=following&sort=title&q=harbor&offset=24');
    const fixture = TestBed.createComponent(mediaLayout);
    fixture.detectChanges();
    const href = (name: string) => {
      const link = [...fixture.nativeElement.querySelectorAll('a')].find(anchor => anchor.textContent?.trim() === name) as HTMLAnchorElement;
      return new URL(link.getAttribute('href') || '', 'http://local');
    };
    const books = href('Books');
    expect(books.pathname).toBe('/media/library');
    expect(books.searchParams.get('kind')).toBe('book');
    expect(books.searchParams.get('q')).toBe('harbor');
    expect(books.searchParams.get('sort')).toBe('title');
    expect(books.searchParams.get('status')).toBeNull();
    expect(books.searchParams.has('offset')).toBeFalse();
    const music = href('Music');
    expect(music.searchParams.get('kind')).toBe('artist');
    expect(music.searchParams.get('status')).toBe('following');
    expect(href('All items').search).toBe('');
    expect(href('Now').pathname).toBe('/media');
  });

  it('marks one canonical or compatible destination current', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Blank }])] });
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(UiSectionNavComponent);
    fixture.componentRef.setInput('label', 'Sections');
    fixture.componentRef.setInput('items', [...financeSections, ...travelSections, ...mediaSections] satisfies UiSectionNavItem[]);

    for (const [url, expected] of [
      ['/finance', '/finance'],
      ['/finance/have?t=assets', '/finance/have'],
      ['/finance/have?t=holdings', '/finance/have?t=holdings'],
      ['/finance/pay?month=2026-10&history=1', '/finance/pay'],
      ['/finance/bills?kind=bill&status=active', '/finance/bills'],
      ['/finance/spending?t=calendar&receipts=1', '/finance/spending?t=calendar'],
      ['/finance/spending?t=activity&receipts=1', '/finance/imports'],
      ['/finance/imports?start=bank', '/finance/imports'],
      ['/travel/trips/9', '/travel'],
      ['/travel/trips/2', '/travel'],
      ['/travel/calendar', '/travel/calendar'],
      ['/media/library?kind=book&q=harbor&offset=24', '/media/library?kind=book'],
      ['/media/library?kind=album&status=completed', '/media/library?kind=artist'],
      ['/media/item/3', '/media/library'],
      ['/media/search', '/media/search'],
    ]) {
      await router.navigateByUrl(url);
      fixture.detectChanges();
      const links = [...fixture.nativeElement.querySelectorAll('a[aria-current="page"]')] as HTMLAnchorElement[];
      expect(links.map(link => link.getAttribute('href'))).withContext(url).toEqual([expected]);
    }
    const add = fixture.nativeElement.querySelector('a[href="/media/add"]') as HTMLAnchorElement;
    expect(add.getAttribute('aria-label')).toBe('Add manually');
    expect(add.textContent?.trim()).toBe('Add');
  });
});
