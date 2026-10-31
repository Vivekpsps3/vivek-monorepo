import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs';
import { silentErrorToast } from '@vivek/ui';
import { HUB_SUMMARY_DEADLINE_MS } from '../hub/hub-load';
import type { Habit, TownResponse } from './town.types';

export interface CreateHabit {
  name: string;
  slot: number;
  per_week: number;
  building_style?: Habit['building_style'];
}
export type PatchHabit = Partial<Pick<CreateHabit, 'name' | 'per_week' | 'building_style'>> & { archived?: true };
export interface CheckinResult {
  day: string;
  checked: boolean;
  habit: Habit;
  town: Pick<TownResponse['town'], 'xp' | 'level' | 'level_xp_start' | 'next_level_xp'>;
}

@Injectable({ providedIn: 'root' })
export class TownApiService {
  private readonly http = inject(HttpClient);
  private options(extra: Record<string, string> = {}) {
    return { params: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...extra }, context: silentErrorToast() };
  }
  getTown() {
    return this.http.get<TownResponse>('/api/town', this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  getHabits(includeArchived = false) {
    return this.http.get<{ items: Habit[] }>('/api/town/habits', this.options({ include_archived: includeArchived ? '1' : '0' }));
  }
  createHabit(body: CreateHabit) {
    return this.http.post<Habit>('/api/town/habits', body, this.options());
  }
  patchHabit(id: number, body: PatchHabit) {
    return this.http.patch<Habit>(`/api/town/habits/${id}`, body, this.options());
  }
  checkin(id: number, day: string) {
    return this.http.post<CheckinResult>(`/api/town/habits/${id}/checkins`, { day }, this.options());
  }
  undoCheckin(id: number, day: string) {
    return this.http.delete<CheckinResult>(`/api/town/habits/${id}/checkins/${encodeURIComponent(day)}`, this.options());
  }
  getCheckins(id: number, from: string, to: string) {
    return this.http.get<{ days: string[] }>(`/api/town/habits/${id}/checkins`, this.options({ from, to }));
  }
}
