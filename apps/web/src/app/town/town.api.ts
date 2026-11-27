import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs';
import { silentErrorToast } from '@vivek/ui';
import { HUB_SUMMARY_DEADLINE_MS } from '../hub/hub-load';

export { HUB_SUMMARY_DEADLINE_MS };
import type { HomeLayoutWrite } from './home-layout';
import type { KeepsakeShelf } from './keepsake.types';
import type { Habit, TownResponse } from './town.types';

export interface RoomLayout {
  room_id: string;
  revision: number;
  items: HomeLayoutWrite['items'];
  recovery_required?: true;
}

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
export interface StampConsumer {
  id: 'market' | 'quest' | 'minigame';
  name: string;
  detail: string;
}
export interface StampReceipt {
  id: number;
  grant_key: string;
  consumer: StampConsumer['id'];
  kind: 'grant' | 'spend' | 'refund';
  amount: number;
  catalog_id: string | null;
  created_at: string;
}
export interface StampEntitlement {
  catalog_id: string;
  active: boolean;
  amount: number;
  spend_receipt_id: number;
}
export interface StampWallet {
  balance: number;
  consumers: StampConsumer[];
  receipts: StampReceipt[];
  entitlements: StampEntitlement[];
}
export interface StampPurchase {
  grant_key: string;
  catalog_id: string;
  amount: number;
}
export interface StampRefund {
  grant_key: string;
  catalog_id: string;
  spend_receipt_id: number;
}
export interface QuestStepView {
  id: string;
  label: string;
  action_id: string;
  source: 'library' | 'travel' | 'memory' | null;
  sample_action_id: string | null;
  sample_label: string | null;
  sample_detail: string | null;
  recorded_action: string | null;
}
export interface QuestKeepsake {
  id: string;
  name: string;
  kind: 'postcard' | 'seal' | 'pennant' | 'print';
  kept: boolean;
}
export interface QuestView {
  id: string;
  title: string;
  detail: string;
  completed: number;
  total: number;
  reward_stamps: number;
  keepsake: QuestKeepsake;
  steps: QuestStepView[];
}
export interface QuestJournal {
  revision: number;
  quests: QuestView[];
}
export interface QuestStepWrite {
  quest_id: string;
  step_id: string;
  action_id: string;
  expected_revision: number;
}
export interface DialogueConversation {
  id: string;
  title: string;
  line: string;
  stamps: number;
  completed: boolean;
}
export interface DialogueResident {
  id: string;
  name: string;
  place: string;
  purpose: string;
  present: boolean;
  rank: number;
  conversations: DialogueConversation[];
}
export interface DialogueDirectory {
  revision: number;
  hour: number;
  residents: DialogueResident[];
}
export interface DialogueWrite {
  resident_id: string;
  conversation_id: string;
  expected_revision: number;
}
export interface DiscoveryView {
  id: string;
  name: string;
  district: string;
  hint: string;
  reaction: string;
  found: boolean;
}
export interface DiscoveryJournal {
  revision: number;
  discoveries: DiscoveryView[];
}
export interface DiscoveryWrite {
  discovery_id: string;
  expected_revision: number;
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
  getKeepsakes(on: string | null) {
    const extra: Record<string, string> = {};
    if (on) extra['on'] = on;
    return this.http.get<KeepsakeShelf>('/api/town/keepsakes', this.options(extra)).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
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
  getStamps() {
    return this.http.get<StampWallet>('/api/town/stamps', this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  purchaseStamps(body: StampPurchase) {
    return this.http.post<StampWallet>('/api/town/stamps/purchases', body, this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  refundStamps(body: StampRefund) {
    return this.http.post<StampWallet>('/api/town/stamps/refunds', body, this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  getLayout(room: string) {
    return this.http.get<RoomLayout>(`/api/town/layouts/${encodeURIComponent(room)}`, this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  saveLayout(room: string, body: HomeLayoutWrite) {
    return this.http.put<RoomLayout>(`/api/town/layouts/${encodeURIComponent(room)}`, body, this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  getQuests() {
    return this.http.get<QuestJournal>('/api/town/quests', this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  recordQuestStep(body: QuestStepWrite) {
    return this.http.post<QuestJournal>('/api/town/quests/steps', body, this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  getResidents() {
    return this.http.get<DialogueDirectory>('/api/town/residents', this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  completeConversation(body: DialogueWrite) {
    return this.http.post<DialogueDirectory>('/api/town/residents/conversations', body, this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  getDiscoveries() {
    return this.http.get<DiscoveryJournal>('/api/town/discoveries', this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
  recordDiscovery(body: DiscoveryWrite) {
    return this.http.post<DiscoveryJournal>('/api/town/discoveries', body, this.options()).pipe(timeout(HUB_SUMMARY_DEADLINE_MS));
  }
}
