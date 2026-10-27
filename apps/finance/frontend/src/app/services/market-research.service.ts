import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../core/api-url';
import { silentErrorToast } from '@vivek/ui';
import { MarketResearchBatchResponse, MarketResearchResponse } from '../models/stock-lab.model';

@Injectable({ providedIn: 'root' })
export class MarketResearchService {
  constructor(private http: HttpClient) {}

  getResearch(symbol: string, options?: { refresh?: boolean; period?: string }): Observable<MarketResearchResponse> {
    const upper = symbol.trim().toUpperCase();
    let params = new HttpParams().set('period', options?.period || '10y');
    if (options?.refresh) params = params.set('refresh', 'true');
    return this.http.get<MarketResearchResponse>(apiUrl(`/market/research/${encodeURIComponent(upper)}`), {
      params,
      context: silentErrorToast(),
    });
  }

  getBatch(symbols: string[], options?: { refresh?: boolean; period?: string }): Observable<MarketResearchBatchResponse> {
    return this.http.post<MarketResearchBatchResponse>(apiUrl('/market/research/batch'), {
      symbols: symbols.map(symbol => symbol.trim().toUpperCase()).filter(Boolean).slice(0, 5),
      refresh: Boolean(options?.refresh),
      period: options?.period || '10y',
    }, { context: silentErrorToast() });
  }
}
