import { HttpClient } from "@angular/common/http";
import {
  Component,
  DestroyRef,
  Injector,
  ViewChild,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Subscription, filter, merge, take } from "rxjs";
import { formatMoney } from "@vivek/browser";
import { FinanceTripSpendRegistry, SESSION_CONTEXT, silentErrorToast } from "@vivek/ui";
import {
  cardKind,
  clearRoomDraft,
  completedPostcards,
  destinationLabel,
  ferryRing,
  mapDestinations,
  matchingPostcard,
  ordinarySouvenirs,
  plannedPostcards,
  postcardFacts,
  postcardLabel,
  readRoomQuery,
  roomDayLabel,
  roomStages,
  settleRoomLoad,
  souvenirLabel,
  tripById,
  tripPto,
  tripSpan,
  tripTransports,
  visibleItinerary,
  type FerryRing,
  type MapDestination,
  type PostcardFacts,
  type RoomQuery,
  type RoomSouvenir,
  type RoomTrip,
  type TripPtoView,
  type TripSpan,
} from "./harbor-rooms.mjs";
import { MapComponent, type TravelPlace } from "./map.component";
import { browserZone, type MemoryList } from "./memories.mjs";
import { TripCostLinkStore } from "./trip-cost-links";
import type { Home } from "./travel.models";

@Component({
  selector: "travel-harbor-rooms",
  standalone: true,
  imports: [MapComponent, RouterLink],
  styleUrl: "./harbor-rooms.component.css",
  templateUrl: "./harbor-rooms.component.html",
})
export class HarborRoomsComponent {
  readonly room = input.required<"map" | "gallery">();
  readonly leave = output<void>();
  readonly formatMoney = formatMoney;
  readonly souvenirKind = cardKind;
  readonly destinationLabel = destinationLabel;
  readonly postcardLabel = postcardLabel;
  readonly souvenirLabel = souvenirLabel;
  readonly roomDayLabel = roomDayLabel;
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly tripSpend = inject(FinanceTripSpendRegistry);
  private readonly links = inject(TripCostLinkStore);
  private readonly ownerId = this.session.currentUser?.id;
  private sessionActive = true;
  private welcomed = false;
  private homeEpoch = 0;
  private memoryEpoch = 0;
  private homeRequest?: Subscription;
  private memoryRequest?: Subscription;
  private chosenDay = signal("");
  @ViewChild(MapComponent) private mapView?: MapComponent;
  readonly home = signal<Home | null>(null);
  readonly memories = signal<MemoryList | null>(null);
  readonly homeError = signal("");
  readonly memoryError = signal("");
  readonly closed = signal(false);
  readonly note = signal("");
  readonly ferry = signal<FerryRing | null>(null);
  readonly selection = signal<RoomQuery>(readRoomQuery(this.route.snapshot.queryParamMap));

  constructor() {
    merge(
      this.session.cleared$,
      this.session.user$.pipe(filter((user) => user?.id !== this.ownerId)),
    )
      .pipe(take(1), takeUntilDestroyed())
      .subscribe(() => this.retire());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.selection.set(readRoomQuery(params));
    });
    afterNextRender(() => {
      if (this.welcomed || this.destroy.destroyed || !this.sessionActive) return;
      this.welcomed = true;
      document.getElementById("harbor-room-title")?.focus();
    }, { injector: this.injector });
    this.load();
  }

  destinations(): MapDestination[] {
    return mapDestinations(this.home());
  }

  planned(): RoomSouvenir[] {
    return plannedPostcards(this.memories()?.memories);
  }

  completed(): RoomSouvenir[] {
    return completedPostcards(this.memories()?.memories);
  }

  souvenirs(): RoomSouvenir[] {
    return ordinarySouvenirs(this.memories()?.memories);
  }

  selectedTrip(): RoomTrip | null {
    return tripById(this.home(), this.selection().trip);
  }

  selectedMemory(): RoomSouvenir | null {
    return matchingPostcard(this.memories()?.memories, this.selection());
  }

  facts(): PostcardFacts | null {
    const memory = this.selectedMemory();
    return memory ? postcardFacts(memory, this.selectedTrip()) : null;
  }

  span(): TripSpan | null {
    const trip = this.selectedTrip();
    return trip ? tripSpan(trip) : null;
  }

  pto(): TripPtoView | null {
    const trip = this.selectedTrip();
    return trip ? tripPto(trip) : null;
  }

  itinerary() {
    return visibleItinerary(this.home(), this.selection().trip);
  }

  transports() {
    return tripTransports(this.selectedTrip());
  }

  stages() {
    const trip = this.selectedTrip();
    if (!trip) return [];
    return roomStages(trip, this.tripSpend.lookup(), this.links.forTrip(trip.id));
  }

  financeLocked(): boolean {
    return this.tripSpend.lookup() == null;
  }

  mapPlaces(): TravelPlace[] {
    const selected = this.selection().trip;
    const rows = this.destinations().filter(
      (row): row is MapDestination & { lat: number; lng: number } =>
        !!row.label && row.lat != null && row.lng != null,
    );
    const chosen = selected == null ? rows : rows.filter((row) => row.tripId === selected);
    const source = chosen.length ? chosen : rows;
    return source.map((row) => ({
      label: row.label,
      lat: row.lat,
      lng: row.lng,
      kindLabel: row.kindLabel,
    }));
  }

  dayPressed(day: string, tripId: number): boolean {
    return this.chosenDay() === day && this.selection().trip === tripId;
  }

  load(): void {
    this.loadHome();
    this.loadMemories();
  }

  loadHome(): void {
    if (!this.sessionActive) return;
    const epoch = ++this.homeEpoch;
    this.homeError.set("");
    this.homeRequest?.unsubscribe();
    this.homeRequest = this.http
      .get<Home>("/travel/api/home", { context: silentErrorToast() })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (home) => {
          if (settleRoomLoad({ epoch, currentEpoch: this.homeEpoch, sessionActive: this.sessionActive, ok: true }) !== "apply") return;
          this.home.set(home);
        },
        error: () => {
          if (settleRoomLoad({ epoch, currentEpoch: this.homeEpoch, sessionActive: this.sessionActive, ok: false }) === "drop") return;
          this.homeError.set("Couldn't load this trip.");
        },
      });
  }

  loadMemories(): void {
    if (!this.sessionActive) return;
    const epoch = ++this.memoryEpoch;
    this.memoryError.set("");
    this.memoryRequest?.unsubscribe();
    this.memoryRequest = this.http
      .get<MemoryList>("/travel/api/memories", {
        params: { tz: this.zone() },
        context: silentErrorToast(),
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (body) => {
          if (settleRoomLoad({ epoch, currentEpoch: this.memoryEpoch, sessionActive: this.sessionActive, ok: true }) !== "apply") return;
          this.memories.set(body);
        },
        error: () => {
          if (settleRoomLoad({ epoch, currentEpoch: this.memoryEpoch, sessionActive: this.sessionActive, ok: false }) === "drop") return;
          this.memoryError.set("Couldn't load saved souvenirs.");
        },
      });
  }

  selectDestination(row: MapDestination): void {
    if (!this.sessionActive) return;
    this.chosenDay.set("");
    this.selection.set({ room: this.room(), trip: row.tripId, place: row.label, card: "" });
    this.writeQuery({ trip: row.tripId, place: row.label || null, card: null });
    this.reveal(row);
  }

  selectPostcard(memory: RoomSouvenir): void {
    if (!this.sessionActive) return;
    const card = cardKind(memory);
    if (!card) return;
    this.selection.set({ room: this.room(), trip: memory.trip_id, place: "", card });
    this.writeQuery({ trip: memory.trip_id, card, place: null });
  }

  selectDay(tripId: number, day: string): void {
    if (!this.sessionActive) return;
    this.chosenDay.set(day);
    this.selection.update((current) => ({ ...current, trip: tripId, room: this.room() }));
    this.writeQuery({ trip: tripId });
  }

  setNote(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !this.sessionActive) return;
    this.note.set(target.value);
  }

  ring(): void {
    if (!this.sessionActive) return;
    this.ferry.set(ferryRing(this.selectedTrip()));
  }

  private reveal(row: MapDestination): void {
    afterNextRender(() => {
      if (this.destroy.destroyed || this.room() !== "map") return;
      const index = this.mapPlaces().findIndex(
        (place) => place.label === row.label && place.kindLabel === row.kindLabel,
      );
      if (index >= 0) this.mapView?.show(index);
    }, { injector: this.injector });
  }

  private writeQuery(extra: Record<string, string | number | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: extra,
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  private zone(): string {
    const named = typeof Intl === "undefined" ? "" : Intl.DateTimeFormat().resolvedOptions().timeZone;
    return browserZone(named);
  }

  private retire(): void {
    this.sessionActive = false;
    this.homeEpoch += 1;
    this.memoryEpoch += 1;
    this.homeRequest?.unsubscribe();
    this.memoryRequest?.unsubscribe();
    this.home.set(null);
    this.memories.set(null);
    this.homeError.set("");
    this.memoryError.set("");
    this.closed.set(true);
    const draft = clearRoomDraft();
    this.note.set(draft.note);
    this.ferry.set(draft.ferry);
    this.selection.set({ room: "", trip: null, place: "", card: "" });
  }
}
