import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '@vivek/ui';
import { MapComponent } from './map.component';
describe('MapComponent theme', () => {
  afterEach(() => TestBed.inject(ThemeService).set('system'));
  it('restyles the open map when the theme service changes', async () => {
    TestBed.configureTestingModule({ imports: [MapComponent] });
    const theme = TestBed.inject(ThemeService); theme.set('light');
    const observers = (theme.theme$.source as unknown as { observers: unknown[] }).observers; const before = observers.length;
    const fixture = TestBed.createComponent(MapComponent); fixture.componentRef.setInput('places', [{ label: 'Zero Island', lat: 0, lng: 0 }]);
    fixture.detectChanges(); TestBed.inject(ApplicationRef).tick(); const component = fixture.componentInstance;
    for (let i = 0; i < 50 && !component.map && !component.initializationFailed; i++) await new Promise(resolve => setTimeout(resolve, 20));
    expect(component.map).withContext(component.status).not.toBeNull();
    const read = () => { const canvas = fixture.nativeElement.querySelector('.map-canvas') as HTMLElement; const tiles = canvas.querySelector('.leaflet-tile-pane') as HTMLElement; return [getComputedStyle(canvas).backgroundColor, getComputedStyle(tiles).backgroundColor, canvas.querySelector('.leaflet-interactive')?.getAttribute('fill')]; };
    expect(read()).toEqual(['rgb(221, 221, 221)', 'rgba(0, 0, 0, 0)', '#3388ff']);
    theme.set('dark'); expect(read()).toEqual(['rgb(40, 37, 31)', 'rgb(40, 37, 31)', '#8fd0c8']);
    theme.set('light'); expect(read()).toEqual(['rgb(221, 221, 221)', 'rgba(0, 0, 0, 0)', '#3388ff']);
    expect(observers.length).toBe(before + 1); fixture.destroy(); expect(observers.length).toBe(before); }); });
