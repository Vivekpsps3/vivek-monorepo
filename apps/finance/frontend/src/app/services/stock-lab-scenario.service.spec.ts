import { TestBed } from '@angular/core/testing';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { StockLabScenario } from '../models/stock-lab.model';
import { StockLabScenarioService } from './stock-lab-scenario.service';

describe('StockLabScenarioService', () => {
  let rows: StockLabScenario[];
  let service: StockLabScenarioService;

  beforeEach(() => {
    rows = [];
    TestBed.configureTestingModule({
      providers: [
        StockLabScenarioService,
        {
          provide: EncryptedStoreService,
          useValue: {
            getStockLabScenarios: jasmine.createSpy('getStockLabScenarios').and.callFake(async () => rows),
            saveStockLabScenario: jasmine.createSpy('saveStockLabScenario').and.callFake(async (row: StockLabScenario, id?: number) => {
              const saved = { ...row, id: id ?? rows.length + 1 };
              rows = rows.filter(existing => existing.id !== saved.id).concat(saved);
              return saved;
            }),
            deleteStockLabScenario: jasmine.createSpy('deleteStockLabScenario').and.callFake(async (id: number) => {
              rows = rows.filter(row => row.id !== id);
            }),
          },
        },
      ],
    });
    service = TestBed.inject(StockLabScenarioService);
  });

  it('saves and lists scenarios through encrypted store', async () => {
    const saved = await service.save(service.createDefaultScenario('schd'));
    const list = await service.list();

    expect(saved.id).toBe(1);
    expect(list[0].primary_symbol).toBe('SCHD');
  });

  it('deletes scenarios through encrypted store', async () => {
    const saved = await service.save(service.createDefaultScenario('spy'));
    await service.delete(saved.id);

    expect(await service.list()).toEqual([]);
  });
});
