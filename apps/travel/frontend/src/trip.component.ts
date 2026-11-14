import { restoreBody } from "./restore-model.mjs";
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { NgTemplateOutlet } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subscription, firstValueFrom } from "rxjs";
import {
  SESSION_CONTEXT,
  ConfirmService,
  ToastService,
  silentErrorToast,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiDialogComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiMenuComponent,
  UiMenuItemDirective,
  UiPageHeaderComponent,
} from "@vivek/ui";
import { MapComponent, TravelPlace } from "./map.component";
import { PtoDaysComponent } from "./pto-days.component";
import {
  allocationDraft,
  allocationText,
  defaultAllocation,
} from "./pto-model.mjs";
import { TransportEditorComponent } from "./transport-editor.component";
import { TripCostsComponent } from "./trip-costs.component";
import { TripRemindersComponent } from "./trip-reminders.component";
import { showDay, showMoney, showRange } from "./display";
import {
  nightsWord,
  ptoText,
  showSubtitle,
  transportWhen,
} from "./trip-header.mjs";
import { formatDateRange, formatDay, formatMoney, fromDollars } from "@vivek/browser";
import { Plan, Stay, Transport, Trip, travelError } from "./travel.models";
import {
  projectItinerary,
  type ItineraryEntry,
} from "./calendar-model.mjs";
import { fieldErrors } from "./validate.mjs";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    UiBadgeComponent,
    UiButtonComponent,
    UiCardComponent,
    UiDialogComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiMenuComponent,
    UiMenuItemDirective,
    UiPageHeaderComponent,
    MapComponent,
    TransportEditorComponent,
    TripCostsComponent,
    TripRemindersComponent,
    PtoDaysComponent,
  ],
  templateUrl: "./trip.component.html",
})
export class TripComponent {
  private readonly injector = inject(Injector);
  readonly showDay = showDay;
  readonly showMoney = showMoney;
  readonly showRange = showRange;
  readonly showSubtitle = showSubtitle;
  readonly transportWhen = transportWhen;
  readonly formatDay = formatDay;
  readonly formatMoney = formatMoney;
  // T2's toCents is not on main; fromDollars is main's existing equivalent
  // (the same parser display.showMoney uses), so it is aliased, not copied.
  readonly toCents = fromDollars;

  whenText(trip: Trip): string {
    return (
      formatDateRange(trip.start_date, trip.end_date) +
      " · " +
      nightsWord(trip.nights) +
      " · " +
      ptoText(trip.pto_days_effective)
    );
  }

  private clockText(time: string): string {
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date(2020, 0, 1, hours || 0, minutes || 0);
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  transportWhenText(transport: Transport): string {
    const when = transportWhen(transport.depart_at, transport.arrive_at);
    let text: string;
    if (when.depart && when.arrive && when.sameDay) {
      text =
        formatDay(when.depart.date) +
        " · " +
        this.clockText(when.depart.time) +
        " → " +
        this.clockText(when.arrive.time);
    } else if (when.depart && when.arrive) {
      text =
        formatDay(when.depart.date) +
        " " +
        this.clockText(when.depart.time) +
        " → " +
        formatDay(when.arrive.date) +
        " " +
        this.clockText(when.arrive.time);
    } else if (when.depart) {
      text =
        formatDay(when.depart.date) +
        " " +
        this.clockText(when.depart.time) +
        " → Arrival not set";
    } else if (when.arrive) {
      text =
        "Departure not set → " +
        formatDay(when.arrive.date) +
        " " +
        this.clockText(when.arrive.time);
    } else {
      text = "Departure not set → Arrival not set";
    }
    if (transport.depart_tz) {
      text += " · " + transport.depart_tz;
      if (transport.arrive_tz && transport.arrive_tz !== transport.depart_tz) {
        text += " · " + transport.arrive_tz;
      }
    }
    return text;
  }

  /** Formatted cost, or "" when the stored cost cannot be parsed (legacy). */
  transportCostText(transport: Transport): string {
    if (!transport.cost) return "";
    const cents = fromDollars(transport.cost);
    if (cents == null) return "";
    try {
      return formatMoney(cents, { currency: transport.currency || "USD" });
    } catch {
      return "";
    }
  }

  parkingLine(parking: Trip["parking"][number]): string {
    const parts = [parking.booked ? "Booked" : "Not booked"];
    if (parking.address) parts.push(parking.address);
    if (parking.cost) {
      const cents = fromDollars(parking.cost);
      if (cents != null) {
        try {
          parts.push(formatMoney(cents, { currency: parking.currency || "USD" }));
        } catch {
          // An unparseable currency leaves the cost off rather than raw.
        }
      }
    }
    return parts.join(" · ");
  }
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private get ownsSession(): boolean {
    return !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private loadingRequest?: Subscription;
  readonly data = signal<Trip | null>(null);
  readonly itinerary = computed(() => {
    const trip = this.data();
    return trip ? projectItinerary(trip) : null;
  });
  readonly mapPlaces = computed<TravelPlace[]>(() => {
    const trip = this.data();
    return trip
      ? [
          ...trip.stays.map((stay) => ({
            label: stay.city,
            lat: stay.lat,
            lng: stay.lng,
          })),
          ...trip.days.flatMap((day) =>
            day.items
              .filter((plan) => plan.lat !== null && plan.lng !== null)
              .map((plan) => ({
                label: plan.title,
                lat: plan.lat,
                lng: plan.lng,
              })),
          ),
        ]
      : [];
  });
  readonly error = signal("");
  readonly saving = signal(false);
  readonly fields = signal<Record<string, string>>({});
  private explained = false;
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly message = signal("");
  readonly places = signal<TravelPlace[]>([]);
  readonly placeError = signal("");
  readonly finding = signal(false);
  readonly placeSearched = signal(false);
  private placeRequest?: Subscription;
  id = 0;
  private readonly activeEditor = signal("");
  get editor(): string {
    return this.activeEditor();
  }
  set editor(value: string) {
    this.activeEditor.set(value);
  }
  editingId: number | null = null;
  mapOpen = false;
  selectedDay = "";
  rovingDay = "";

  revealChip(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLElement) target.scrollIntoView({ inline: "nearest", block: "nearest" });
  }

  private applyRouteDay(): void {
    const trip = this.data();
    if (!trip) return;
    const day = this.route.snapshot.queryParamMap.get("day") || "";
    if (day && trip.days.some((item) => item.on_date === day)) {
      this.selectedDay = day;
      this.rovingDay = day;
      return;
    }
    if (!day) this.selectedDay = "";
  }

  stripTabIndex(iso: string, index: number): number {
    const current = this.rovingDay || this.selectedDay;
    if (!current) return index === 0 ? 0 : -1;
    return current === iso ? 0 : -1;
  }

  onStripKey(event: KeyboardEvent): void {
    const key = event.key;
    const moving =
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "Home" ||
      key === "End";
    if (!moving && key !== "Enter") return;
    const days = this.itinerary()?.days ?? [];
    if (!days.length) return;
    event.preventDefault();
    const current = this.rovingDay || this.selectedDay || days[0].onDate;
    let index = days.findIndex((day) => day.onDate === current);
    if (index < 0) index = 0;
    if (key === "End") index = days.length - 1;
    else if (key === "Home") index = 0;
    else if (key === "ArrowRight" || key === "ArrowDown") index = Math.min(days.length - 1, index + 1);
    else if (key === "ArrowLeft" || key === "ArrowUp") index = Math.max(0, index - 1);
    const iso = days[index].onDate;
    if (key === "Enter") {
      this.selectDay(iso, true);
      return;
    }
    this.rovingDay = iso;
    document.getElementById("trip-day-" + iso)?.focus();
  }

  selectDay(iso: string, focusContent = false): void {
    const trip = this.data();
    if (!trip?.days.some((day) => day.on_date === iso)) return;
    this.selectedDay = iso;
    this.rovingDay = iso;
    if (this.route.snapshot.queryParamMap.get("day") !== iso) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { day: iso },
        queryParamsHandling: "merge",
      });
    }
    if (focusContent) {
      // An empty day's panel is created by this selection. A timer can fire
      // before Angular renders it, so focus only after the panel exists.
      afterNextRender(() => {
        if (!this.destroy.destroyed && this.selectedDay === iso) {
          document.getElementById("itinerary-day-" + iso)?.focus();
        }
      }, { injector: this.injector });
    }
  }

  addPlan(iso: string): void {
    this.selectDay(iso);
    this.open("activity");
  }

  cityOn(iso: string): string {
    return this.data()?.days.find((day) => day.on_date === iso)?.city || "";
  }

  planFor(entry: ItineraryEntry): Plan | null {
    if (entry.source !== "plan") return null;
    const trip = this.data();
    if (!trip) return null;
    return (
      trip.days.flatMap((day) => day.items).find((plan) => plan.id === entry.id) ||
      trip.outside_plans.find((plan) => plan.id === entry.id) ||
      null
    );
  }

  transportFor(entry: ItineraryEntry): Transport | null {
    if (entry.source !== "transport") return null;
    return this.data()?.transports.find((item) => item.id === entry.id) ?? null;
  }

  parkingFor(entry: ItineraryEntry): Trip["parking"][number] | null {
    if (entry.source !== "parking") return null;
    return this.data()?.parking.find((item) => item.id === entry.id) ?? null;
  }

  transportEntryText(entry: ItineraryEntry, transport: Transport): string {
    if (!entry.primary && entry.part === "arrival") {
      const when = transportWhen(transport.depart_at, transport.arrive_at);
      return when.arrive ? "Arrives " + this.clockText(when.arrive.time) : "Arrives";
    }
    return this.transportWhenText(transport);
  }

  transportEntryCost(entry: ItineraryEntry, transport: Transport): string {
    if (!entry.primary) return "";
    return this.transportCostText(transport);
  }

  entryAction(entry: ItineraryEntry): string {
    if (entry.source === "plan") return "Edit activity";
    if (entry.source === "transport") return "Edit transport";
    return "Edit parking";
  }

  editEntry(entry: ItineraryEntry): void {
    if (entry.source === "plan") {
      const plan = this.planFor(entry);
      if (plan) this.open("activity", plan);
      return;
    }
    if (entry.source === "transport") {
      const transport = this.transportFor(entry);
      if (transport) this.open("transport", transport);
      return;
    }
    const parking = this.parkingFor(entry);
    if (parking) this.open("parking", parking);
  }

  removeEntry(entry: ItineraryEntry): void {
    if (entry.source === "plan") void this.remove("/plans/" + entry.id, "activity");
    else if (entry.source === "transport") void this.remove("/transports/" + entry.id, "transport");
    else void this.remove("/parking/" + entry.id, "parking");
  }

  dayOpen(day: { onDate: string; entries: unknown[]; unscheduled: unknown[] }): boolean {
    return day.entries.length > 0 || day.unscheduled.length > 0 || this.selectedDay === day.onDate;
  }
  transport: Record<string, unknown> | null = null;
  charges: Record<string, string> = {};
  ptoEnabled = true;
  private ptoSaved = "";
  placeStay: Stay | null = null;
  placeQuery = "";
  meta = {
    title: "",
    start_date: "",
    end_date: "",
    status: "planning",
    counts_as_pto: true,
  };
  plan = {
    on_date: "",
    title: "",
    kind: "activity",
    start_time: "",
    end_time: "",
    place_name: "",
    address: "",
    url: "",
    cost: null as number | null,
    currency: "USD",
    paid: false,
    notes: "",
  };
  stay = {
    city: "",
    arrive_on: "",
    leave_on: "",
    lodging_name: "",
    lodging_address: "",
    notes: "",
  };
  note = { body: "", on_date: "" };
  reminder = { title: "", due_at: "", kind: "general", notes: "", done: false };
  parking = {
    place_name: "",
    necessary: "unknown",
    booked: false,
    arrangement: "self_park",
    address: "",
    confirmation: "",
    cost: null as number | null,
    currency: "USD",
    notes: "",
  };
  budget = {
    category: "other",
    label: "",
    amount: null as number | null,
    currency: "USD",
    paid: false,
    notes: "",
  };
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.id = Number(p.get("id"));
      this.editor = "";
      this.resetFields();
      this.saving.set(false);
      this.selectedDay = "";
      this.rovingDay = "";
      this.data.set(null);
      this.load(false);
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(() => {
      this.applyRouteDay();
    });
  }
  private path(): string {
    return "/trips/" + this.id;
  }
  load(preservePto = this.ptoDirty): void {
    this.loadingRequest?.unsubscribe();
    this.error.set("");
    this.loadingRequest = this.http
      .get<Trip>("/travel/api" + this.path())
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.data.set(d);
          if (!preservePto) {
            const amounts = new Map(
              d.pto_dates.map((day) => [day.on_date, day.amount]),
            );
            this.charges = Object.fromEntries(
              d.days.map((day) => [
                day.on_date,
                allocationText(amounts.get(day.on_date) ?? "0"),
              ]),
            );
            this.ptoEnabled = d.counts_as_pto;
            this.ptoSaved = this.ptoSnapshot();
          }
          this.meta = {
            title: d.title,
            start_date: d.start_date,
            end_date: d.end_date,
            status: d.status,
            counts_as_pto: d.counts_as_pto,
          };
          this.applyRouteDay();
        },
        error: (e) => this.error.set(travelError(e)),
      });
  }
  private ptoSnapshot(): string {
    return JSON.stringify([this.ptoEnabled, this.charges]);
  }
  get ptoDirty(): boolean {
    return !!this.data() && this.ptoSaved !== this.ptoSnapshot();
  }
  canLeave(): boolean | Promise<boolean> {
    return (
      !this.ownsSession ||
      (!this.editor && !this.ptoDirty) ||
      this.confirm.ask(
        "Leave this editor?",
        "Your unsaved changes will be discarded.",
        "Leave editor",
        "Keep editing",
      )
    );
  }
  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    if (this.ownsSession && (this.editor || this.ptoDirty)) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  async close(): Promise<void> {
    if (
      !this.saving() &&
      (await this.confirm.ask(
        "Discard this draft?",
        "Your changes in this editor have not been saved.",
        "Discard changes",
        "Keep editing",
      ))
    ) {
      if (this.editor === "location") this.placeSearchChanged();
      this.editor = "";
      this.resetFields();
    }
  }
  field(name: string): string {
    return this.fields()[name] || "";
  }
  live(): void {
    if (this.explained) this.fields.set(this.problems());
  }
  private resetFields(): void {
    this.fields.set({});
    this.explained = false;
  }
  private problems(): Record<string, string> {
    const named = (raw: Record<string, string>, aliases: Record<string, string> = {}) => {
      const errors: Record<string, string> = {};
      for (const [name, message] of Object.entries(raw)) {
        if (message) errors[aliases[name] || name] = message;
      }
      return errors;
    };
    if (this.editor === "trip") {
      return named(
        fieldErrors("trip", {
          title: this.meta.title,
          start_date: this.meta.start_date,
          end_date: this.meta.end_date,
        }),
        { start_date: "start", end_date: "end" },
      );
    }
    if (this.editor === "activity") {
      return named(
        fieldErrors("plan", { title: this.plan.title, on_date: this.plan.on_date }),
        { on_date: "date" },
      );
    }
    if (this.editor === "destination") {
      return named(
        fieldErrors("stay", {
          city: this.stay.city,
          arrive_on: this.stay.arrive_on,
          leave_on: this.stay.leave_on,
        }),
        { arrive_on: "arrive", leave_on: "leave" },
      );
    }
    if (this.editor === "note") return fieldErrors("note", { body: this.note.body });
    if (this.editor === "reminder") return fieldErrors("reminder", { title: this.reminder.title });
    if (this.editor === "budget") {
      return fieldErrors("budget", {
        label: this.budget.label,
        amount: this.budget.amount,
        currency: this.budget.currency,
      });
    }
    if (this.editor === "location") return fieldErrors("location", { query: this.placeQuery });
    return {};
  }
  private explain(): boolean {
    const errors = this.problems();
    this.fields.set(errors);
    this.explained = true;
    const first = Object.keys(errors)[0];
    if (!first) return false;
    setTimeout(() => {
      const node = this.host.nativeElement.querySelector(`[name="${CSS.escape(first)}"]`);
      if (node instanceof HTMLElement) node.focus();
    });
    return true;
  }
  open(
    kind: string,
    item?:
      | Transport
      | Plan
      | Stay
      | Trip["parking"][number]
      | Trip["budget"]["manual"][number],
  ): void {
    this.error.set("");
    this.resetFields();
    this.editingId = item?.id || null;
    this.editor = kind;
    if (kind === "parking")
      this.parking = {
        place_name: "",
        necessary: "unknown",
        booked: false,
        arrangement: "self_park",
        address: "",
        confirmation: "",
        cost: null,
        currency: "USD",
        notes: "",
        ...item,
      } as typeof this.parking;
    if (kind === "budget")
      this.budget = {
        category: "other",
        label: "",
        amount: null,
        currency: "USD",
        paid: false,
        notes: "",
        ...item,
      } as typeof this.budget;
    if (kind === "note") this.note = { body: "", on_date: "" };
    if (kind === "reminder")
      this.reminder = {
        title: "",
        due_at: "",
        kind: "general",
        notes: "",
        done: false,
      };
    if (kind === "transport") this.transport = item ? { ...item } : null;
    if (kind === "activity")
      this.plan = {
        on_date: this.selectedDay || this.data()!.start_date,
        title: "",
        kind: "activity",
        start_time: "",
        end_time: "",
        place_name: "",
        address: "",
        url: "",
        cost: null,
        currency: "USD",
        paid: false,
        notes: "",
        ...item,
      } as typeof this.plan;
    if (kind === "destination")
      this.stay = {
        city: "",
        arrive_on: this.data()!.start_date,
        leave_on: this.data()!.end_date,
        lodging_name: "",
        lodging_address: "",
        notes: "",
        ...item,
      } as typeof this.stay;
  }
  mutate(
    path: string,
    body: object,
    method = "post",
    close = true,
    onFail?: () => void,
  ): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set("");
    const tripId = this.id;
    const ptoSnapshot = this.ptoSnapshot();
    const cleaned = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [
        key,
        value === "" ? null : value,
      ]),
    );
    this.http
      .request(method, "/travel/api" + path, { body: cleaned })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          if (!this.ownsSession || this.id !== tripId) return;
          this.saving.set(false);
          if (close) {
            this.editor = "";
            this.resetFields();
          }
          if ("pto_dates" in body) this.ptoSaved = ptoSnapshot;
          this.message.set("Saved.");
          this.load();
        },
        error: (e) => {
          onFail?.();
          if (this.ownsSession && this.id === tripId) {
            this.saving.set(false);
            this.error.set(travelError(e));
          }
        },
      });
  }
  saveTransport(value: Record<string, unknown>): void {
    this.mutate(
      this.editingId
        ? "/transports/" + this.editingId
        : this.path() + "/transports",
      value,
      this.editingId ? "patch" : "post",
    );
  }
  savePlan(): void {
    if (this.explain()) return;
    this.mutate(
      this.editingId ? "/plans/" + this.editingId : this.path() + "/plans",
      this.plan,
      this.editingId ? "patch" : "post",
    );
  }
  saveStay(): void {
    if (this.explain()) return;
    this.mutate(
      this.editingId ? "/stays/" + this.editingId : this.path() + "/stays",
      this.stay,
      this.editingId ? "patch" : "post",
    );
  }
  async saveMeta(): Promise<void> {
    if (this.saving() || this.explain()) return;
    const trip = this.data()!;
    const outside =
      trip.stays.filter(
        (stay) =>
          stay.arrive_on < this.meta.start_date ||
          stay.leave_on > this.meta.end_date,
      ).length +
      trip.days
        .filter(
          (day) =>
            day.on_date < this.meta.start_date ||
            day.on_date > this.meta.end_date,
        )
        .reduce((sum, day) => sum + day.items.length, 0);
    if (
      outside &&
      !(await this.confirm.ask(
        "Keep items outside the new dates?",
        outside +
          " destinations or plans will remain outside this range. Removed PTO dates stop counting.",
        "Change dates",
        "Keep editing",
      ))
    )
      return;
    this.mutate(this.path(), this.meta, "patch");
  }
  ptoDates(): string[] {
    return this.data()?.days.map((day) => day.on_date) ?? [];
  }
  chooseDay(choice: { on_date: string; amount: string }): void {
    this.charges = { ...this.charges, [choice.on_date]: choice.amount };
  }
  totalPto(): string {
    return allocationDraft(this.ptoDates(), this.charges, this.ptoEnabled).total;
  }
  weekdays(): void {
    const amounts = { ...this.charges };
    for (const day of this.ptoDates()) amounts[day] = defaultAllocation(day);
    this.charges = amounts;
  }
  clearPto(): void {
    const amounts = { ...this.charges };
    for (const day of this.ptoDates()) amounts[day] = "0";
    this.charges = amounts;
  }
  async savePto(): Promise<void> {
    if (
      this.data()!.pto_mode === "legacy" &&
      !(await this.confirm.ask(
        "Replace the legacy PTO total?",
        "The recorded " +
          this.data()!.pto_days_effective +
          " days will be replaced by " +
          this.totalPto() +
          " days on the dates you selected.",
        "Save dated PTO",
        "Keep legacy total",
      ))
    )
      return;
    this.mutate(
      this.path(),
      {
        counts_as_pto: this.ptoEnabled,
        pto_dates: allocationDraft(this.ptoDates(), this.charges).payload,
      },
      "patch",
      false,
    );
  }
  async remove(path: string, label: string): Promise<void> {
    if (this.saving() || !this.ownsSession) return;
    const trip = this.data()!;
    const rows: Record<string, { id: number }[]> = {
      destination: trip.stays,
      transport: trip.transports,
      activity: [
        ...trip.days.flatMap((day) => day.items),
        ...trip.outside_plans,
      ],
      parking: trip.parking,
      note: trip.note_entries,
      reminder: trip.reminders,
      cost: trip.budget.manual,
    };
    const row = rows[label]?.find(
      (item) => item.id === Number(path.split("/").at(-1)),
    );
    if (!row) return;
    const kind =
      (
        { destination: "stay", activity: "plan", cost: "budget" } as Record<
          string,
          string
        >
      )[label] || label;
    const body = restoreBody(kind, row);
    const collection = path.split("/")[1];
    const tripId = trip.id;
    let restoring = false;
    const restore = async () => {
      if (restoring || !this.ownsSession) return;
      restoring = true;
      try {
        await firstValueFrom(
          this.http.post(
            "/travel/api/trips/" + tripId + "/" + collection,
            body,
          ),
        );
        if (!this.ownsSession) return;
        if (!this.destroy.destroyed && this.id === tripId) this.load();
        this.toast.success("Restored " + label + ".");
      } catch (error) {
        if (this.ownsSession)
          this.toast.error(travelError(error), {
            label: "Retry",
            run: () => {
              void restore();
            },
          });
      } finally {
        restoring = false;
      }
    };
    this.saving.set(true);
    this.error.set("");
    this.http
      .delete("/travel/api" + path)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          if (!this.ownsSession) return;
          if (this.id === tripId) {
            this.saving.set(false);
            this.load();
          }
          this.toast.success("Removed " + label + ".", () => {
            void restore();
          });
        },
        error: (error) => {
          if (this.ownsSession && this.id === tripId) {
            this.saving.set(false);
            this.error.set(travelError(error));
          }
        },
      });
  }
  async deleteTrip(): Promise<void> {
    const trip = this.data();
    if (!trip || !this.ownsSession) return;
    const title = trip.title;
    const url = "/travel/api" + this.path();
    const deleted = await this.confirm.confirmAction({
      title: "Delete " + title + "?",
      message: "This removes the trip, bookings, notes and its PTO usage.",
      confirmLabel: "Delete trip",
      cancelLabel: "Keep trip",
      busyLabel: "Deleting trip",
      phrase: title,
      errorMessage: "Couldn't delete this trip. Nothing was deleted. Try again.",
      run: () => firstValueFrom(this.http.delete(url, { context: silentErrorToast() })),
    });
    if (!deleted || !this.ownsSession) return;
    this.editor = "";
    await this.router.navigateByUrl("/travel");
  }
  chooseLocation(stay: Stay): void {
    this.placeSearchChanged();
    this.placeStay = stay;
    this.placeQuery = stay.city;
    this.resetFields();
    this.editor = "location";
  }
  placeSearchChanged(): void {
    this.placeRequest?.unsubscribe();
    this.finding.set(false);
    this.placeSearched.set(false);
    this.places.set([]);
    this.placeError.set("");
  }
  findPlaces(): void {
    const query = this.placeQuery.trim();
    if (!this.placeStay || this.editor !== "location" || this.finding() || this.saving()) return;
    if (this.explain()) {
      this.placeSearchChanged();
      return;
    }
    const stayId = this.placeStay.id;
    this.placeSearchChanged();
    this.finding.set(true);
    this.placeRequest = this.http
      .get<{
        results: TravelPlace[];
      }>("/travel/api/places/search", { params: { q: query } })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (
            this.editor !== "location" ||
            this.placeStay?.id !== stayId ||
            this.placeQuery.trim() !== query
          )
            return;
          this.places.set(r.results);
          this.placeSearched.set(true);
          this.finding.set(false);
        },
        error: (e) => {
          this.placeError.set(travelError(e));
          this.finding.set(false);
        },
      });
  }
  selectPlace(place: TravelPlace): void {
    if (this.placeStay && !this.finding() && this.places().includes(place))
      this.mutate(
        "/stays/" + this.placeStay.id,
        { ...this.placeStay, lat: place.lat, lng: place.lng },
        "patch",
      );
  }
  reminderDone(
    reminder: Trip["reminders"][number],
    onFail?: () => void,
  ): void {
    this.mutate(
      "/reminders/" + reminder.id,
      { ...reminder, done: !reminder.done },
      "patch",
      false,
      onFail,
    );
  }
  addReminder(title: string, onFail: () => void): void {
    this.mutate(this.endpoint("/reminders"), { title }, "post", false, onFail);
  }
  saveParking(): void {
    if (this.explain()) return;
    this.mutate(
      this.editingId ? "/parking/" + this.editingId : this.path() + "/parking",
      this.parking,
      this.editingId ? "patch" : "post",
    );
  }
  saveBudget(): void {
    if (this.explain()) return;
    this.mutate(
      this.editingId
        ? "/budget-lines/" + this.editingId
        : this.path() + "/budget-lines",
      this.budget,
      this.editingId ? "patch" : "post",
    );
  }
  saveNote(): void {
    if (this.explain()) return;
    this.mutate(this.endpoint("/notes"), this.note);
  }
  saveReminder(): void {
    if (this.explain()) return;
    this.mutate(this.endpoint("/reminders"), this.reminder);
  }
  endpoint(suffix: string): string {
    return this.path() + suffix;
  }
  hasPlans(): boolean {
    const projected = this.itinerary();
    if (!projected) return false;
    return (
      projected.unscheduled.length > 0 ||
      projected.outOfRange.length > 0 ||
      projected.days.some((day) => day.entries.length > 0 || day.unscheduled.length > 0)
    );
  }
}
