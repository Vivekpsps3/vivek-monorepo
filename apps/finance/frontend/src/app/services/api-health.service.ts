import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';
import { apiUrl } from '../core/api-url';

/** Polls GET /api/health (proxied in dev). */
@Injectable({ providedIn: 'root' })
export class ApiHealthService {
  private readonly healthUrl = apiUrl('/health');

  constructor(private http: HttpClient) {}

  /** One health check. Retry uses this so a click does not sit through startup delays. */
  checkOnce(): Observable<boolean> {
    return this.probe().pipe(catchError(() => of(false)));
  }

  /**
   * Up to 10 attempts, 1.5s apart — covers Alembic startup and uvicorn --reload gaps.
   */
  checkWithRetries(): Observable<boolean> {
    return this.probe().pipe(
      retry({ count: 9, delay: 1500 }),
      catchError(() => of(false))
    );
  }

  private probe(): Observable<boolean> {
    return this.http.get<{ status: string }>(this.healthUrl).pipe(map(() => true));
  }
}