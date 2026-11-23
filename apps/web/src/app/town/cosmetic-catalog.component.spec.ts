import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { CosmeticCatalogComponent } from './cosmetic-catalog.component';
import { COSMETIC_LAYOUT_CAP, cosmeticCatalog } from './cosmetic-catalog';

function layoutIds(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('ul[aria-label="Saved layout"] [data-layout-id]')]
    .map(item => item.dataset['layoutId'] ?? '');
}

async function open(user$: BehaviorSubject<{ id: number } | null>, url = '/town/cosmetics'): Promise<{
  harness: RouterTestingHarness;
  host: HTMLElement;
}> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'town/cosmetics', component: CosmeticCatalogComponent }]),
      { provide: SessionService, useValue: { user$ } },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return { harness, host: harness.routeNativeElement as HTMLElement };
}

describe('cosmetic catalog page', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('selects every catalog id inside its declared bounds for day and night', async () => {
    const user$ = new BehaviorSubject<{ id: number } | null>({ id: 4 });
    const { harness, host } = await open(user$);
    expect(host.querySelector('h1')?.textContent).toContain('Cosmetic catalog');
    expect(host.textContent).toContain('Starter items are free');
    expect(host.textContent).not.toMatch(/Buy|Grant|balance/i);
    for (const name of ['Stepping stone', 'Small planter', 'Wooden lantern', 'Wind vane', 'Shell marker', 'Path lamp', 'Bench', 'Bird bath', 'Civic pennant']) {
      expect(host.textContent).not.toContain(name);
    }

    for (const part of ['day', 'night'] as const) {
      for (const item of cosmeticCatalog) {
        await harness.navigateByUrl(`/town/cosmetics?item=${item.id}&part=${part}`);
        const link = host.querySelector<HTMLAnchorElement>(`[data-catalog-id="${item.id}"]`);
        const preview = host.querySelector<HTMLElement>('.preview');
        const image = preview?.querySelector('img');
        expect(link?.getAttribute('aria-current')).withContext(item.id).toBe('true');
        expect(link?.textContent).withContext(item.id).toContain(item.priceStamps === 0 ? 'Free' : `${item.priceStamps} Stamps`);
        expect(preview?.dataset['preview']).toBe(item.id);
        expect(preview?.dataset['layer']).toBe(String(item.layer));
        expect(preview?.style.width).toBe(`${item.bounds.width}px`);
        expect(preview?.style.height).toBe(`${item.bounds.height}px`);
        expect(image?.getAttribute('src')).toContain(`/town/cosmetics/${item.id}-${part}.svg`);
        expect(image?.getAttribute('width')).toBe(String(item.bounds.width));
        expect(image?.getAttribute('height')).toBe(String(item.bounds.height));
        expect(host.textContent).toContain(`${item.footprint.columns} by ${item.footprint.rows} cells`);
        expect(host.textContent).toContain('Original artwork for Terraria-on-Sea');
      }
    }
  });

  it('labels a missing asset and keeps that id in the saved layout', async () => {
    const user$ = new BehaviorSubject<{ id: number } | null>({ id: 4 });
    const { host } = await open(user$, '/town/cosmetics?item=missing-keepsake&part=day');
    expect(host.querySelector('[data-preview="unsupported"]')?.textContent).toContain('Unsupported item');
    expect(host.textContent).toContain('The saved layout still includes missing-keepsake');
    expect(layoutIds(host)).toEqual(['oak-seat', 'missing-keepsake']);
    expect(host.querySelector('.tile.unsupported')?.textContent).toContain('Unsupported item');
  });

  it('places a free starter, refuses a shop item, and preserves the unsupported entry', async () => {
    const user$ = new BehaviorSubject<{ id: number } | null>({ id: 4 });
    const { harness, host } = await open(user$, '/town/cosmetics?item=fern&part=day');
    const column = host.querySelector<HTMLSelectElement>('select[name="column"]');
    if (!column) throw new Error('column draft missing');
    column.value = '6';
    column.dispatchEvent(new Event('change'));
    harness.detectChanges();
    host.querySelector<HTMLButtonElement>('button[name="place"]')?.click();
    harness.detectChanges();
    expect(layoutIds(host)).toEqual(['oak-seat', 'missing-keepsake', 'fern']);
    expect(host.textContent).not.toContain('This layout already holds 64 items.');

    await harness.navigateByUrl('/town/cosmetics?item=shell-stool&part=night');
    expect(host.querySelector('button[name="place"]')).toBeNull();
    expect(host.textContent).toContain('5 Stamps');
    expect(host.textContent).toContain('Listed for the workshop');
    expect(layoutIds(host)).toEqual(['oak-seat', 'missing-keepsake', 'fern']);

    await harness.navigateByUrl('/town/cosmetics?item=bed&part=day');
    const bedColumn = host.querySelector<HTMLSelectElement>('select[name="column"]');
    if (!bedColumn) throw new Error('column draft missing');
    bedColumn.value = '11';
    bedColumn.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('button[name="place"]')?.disabled).toBeTrue();
    expect(host.textContent).toContain('Bed does not fit at column 11, row 0.');
    expect(layoutIds(host)).toEqual(['oak-seat', 'missing-keepsake', 'fern']);
  });

  it('keeps the draft when artwork fails and ignores a late load after owner change or leave', async () => {
    const user$ = new BehaviorSubject<{ id: number } | null>({ id: 4 });
    const { harness, host } = await open(user$, '/town/cosmetics?item=desk-lamp&part=night');
    const column = host.querySelector<HTMLSelectElement>('select[name="column"]');
    const image = () => host.querySelector<HTMLImageElement>('.preview img');
    if (!column || !image()) throw new Error('catalog controls missing');
    column.value = '6';
    column.dispatchEvent(new Event('change'));
    harness.detectChanges();
    image()?.dispatchEvent(new Event('error'));
    harness.detectChanges();
    expect(column.value).toBe('6');
    expect(host.textContent).toContain('Artwork is unavailable');
    expect(layoutIds(host)).toEqual(['oak-seat', 'missing-keepsake']);
    expect(host.querySelector<HTMLElement>('.preview')?.dataset['painted']).toBe('false');

    const stale = image()?.getAttribute('src') ?? '';
    const retry = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Retry artwork'));
    retry?.click();
    harness.detectChanges();
    const fresh = image()?.getAttribute('src') ?? '';
    expect(fresh).not.toBe(stale);
    expect(fresh).toContain('desk-lamp-night.svg');

    image()?.setAttribute('src', stale);
    image()?.dispatchEvent(new Event('load'));
    harness.detectChanges();
    expect(host.querySelector<HTMLElement>('.preview')?.dataset['painted']).toBe('false');

    image()?.setAttribute('src', fresh);
    image()?.dispatchEvent(new Event('load'));
    harness.detectChanges();
    expect(host.querySelector<HTMLElement>('.preview')?.dataset['painted']).toBe('true');

    user$.next({ id: 8 });
    harness.detectChanges();
    expect(host.querySelector<HTMLSelectElement>('select[name="column"]')?.value).toBe('0');
    expect(layoutIds(host)).toEqual(['oak-seat', 'missing-keepsake']);
    image()?.setAttribute('src', fresh);
    image()?.dispatchEvent(new Event('load'));
    harness.detectChanges();
    expect(host.querySelector<HTMLElement>('.preview')?.dataset['painted']).toBe('false');

    user$.next(null);
    harness.detectChanges();
    expect(layoutIds(host)).toEqual(['oak-seat', 'missing-keepsake']);
    expect(host.querySelector<HTMLSelectElement>('select[name="column"]')?.value).toBe('0');

    harness.fixture.destroy();
    image()?.dispatchEvent(new Event('load'));
    expect(layoutIds(host)).toEqual(['oak-seat', 'missing-keepsake']);
  });

  it('stops adding items at the layout cap without dropping the unsupported id', async () => {
    const user$ = new BehaviorSubject<{ id: number } | null>({ id: 4 });
    const { harness, host } = await open(user$, '/town/cosmetics?item=planter&part=day');
    const place = () => host.querySelector<HTMLButtonElement>('button[name="place"]');
    for (let count = layoutIds(host).length; count < COSMETIC_LAYOUT_CAP; count += 1) {
      place()?.click();
      harness.detectChanges();
    }
    expect(layoutIds(host)).toHaveSize(COSMETIC_LAYOUT_CAP);
    expect(layoutIds(host)).toContain('missing-keepsake');
    place()?.click();
    harness.detectChanges();
    expect(layoutIds(host)).toHaveSize(COSMETIC_LAYOUT_CAP);
    expect(host.textContent).toContain('This layout already holds 64 items.');
    expect(layoutIds(host).filter(id => id === 'missing-keepsake')).toEqual(['missing-keepsake']);
  });
});
