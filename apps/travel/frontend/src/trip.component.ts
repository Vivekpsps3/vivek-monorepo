import { restoreBody } from './restore-model.mjs';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, firstValueFrom } from 'rxjs';
import { SESSION_CONTEXT, ConfirmService, ToastService, UiDialogComponent } from '@vivek/ui';
import { MapComponent, TravelPlace } from './map.component';
import { TransportEditorComponent } from './transport-editor.component';
import { Plan, Stay, Transport, Trip, travelError } from './travel.models';
@Component({ standalone: true, imports: [FormsModule, RouterLink, UiDialogComponent, MapComponent, TransportEditorComponent], templateUrl: './trip.component.html' })
export class TripComponent {
    private readonly session = inject(SESSION_CONTEXT);
    private readonly ownerId = this.session.currentUser?.id;
    private get ownsSession(): boolean { return !!this.ownerId && this.ownerId === this.session.currentUser?.id; }
    private readonly http = inject(HttpClient);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly destroy = inject(DestroyRef);
    private readonly confirm = inject(ConfirmService);
    private readonly toast = inject(ToastService);
    private loadingRequest?: Subscription;
    readonly data = signal<Trip | null>(null);
    readonly mapPlaces = computed<TravelPlace[]>(() => {
        const trip = this.data();
        return trip ? [...trip.stays.map(stay => ({ label: stay.city, lat: stay.lat, lng: stay.lng })), ...trip.days.flatMap(day => day.items.filter(plan => plan.lat !== null && plan.lng !== null).map(plan => ({ label: plan.title, lat: plan.lat, lng: plan.lng })))] : [];
    });
    readonly error = signal('');
    readonly saving = signal(false);
    readonly message = signal('');
    readonly places = signal<TravelPlace[]>([]);
    readonly placeError = signal('');
    readonly finding = signal(false);
    readonly placeSearched = signal(false);
    private placeRequest?: Subscription;
    id = 0;
    private readonly activeEditor = signal('');
    get editor(): string { return this.activeEditor(); }
    set editor(value: string) { this.activeEditor.set(value); }
    editingId: number | null = null;
    mapOpen = false;
    selectedDay = '';
    transport: Record<string, unknown> | null = null;
    charges: Record<string, number> = {};
    ptoEnabled = true;
    private ptoSaved = '';
    placeStay: Stay | null = null;
    placeQuery = '';
    meta = { title: '', start_date: '', end_date: '', status: 'planning', counts_as_pto: true };
    plan = { on_date: '', title: '', kind: 'activity', start_time: '', end_time: '', place_name: '', address: '', url: '', cost: null as number | null, currency: 'USD', paid: false, notes: '' };
    stay = { city: '', arrive_on: '', leave_on: '', lodging_name: '', lodging_address: '', notes: '' };
    note = { body: '', on_date: '' };
    reminder = { title: '', due_at: '', kind: 'general', notes: '', done: false };
    parking = { place_name: '', necessary: 'unknown', booked: false, arrangement: 'self_park', address: '', confirmation: '', cost: null as number | null, currency: 'USD', notes: '' };
    budget = { category: 'other', label: '', amount: null as number | null, currency: 'USD', paid: false, notes: '' };
    constructor() { this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(p => { this.id = Number(p.get('id')); this.editor = ''; this.saving.set(false); this.data.set(null); this.load(false); }); }
    private path(): string { return '/trips/' + this.id; }
    load(preservePto = this.ptoDirty): void {
        this.loadingRequest?.unsubscribe();
        this.error.set('');
        this.loadingRequest = this.http.get<Trip>('/travel/api' + this.path()).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: d => {
                this.data.set(d);
                if (!preservePto) {
                    const amounts = new Map(d.pto_dates.map(day => [day.on_date, Number(day.amount)]));
                    this.charges = Object.fromEntries(d.days.map(day => [day.on_date, amounts.get(day.on_date) ?? 0]));
                    this.ptoEnabled = d.counts_as_pto;
                    this.ptoSaved = this.ptoSnapshot();
                }
                this.meta = { title: d.title, start_date: d.start_date, end_date: d.end_date, status: d.status, counts_as_pto: d.counts_as_pto };
            }, error: e => this.error.set(travelError(e)) });
    }
    private ptoSnapshot(): string { return JSON.stringify([this.ptoEnabled, this.charges]); }
    get ptoDirty(): boolean { return !!this.data() && this.ptoSaved !== this.ptoSnapshot(); }
    canLeave(): boolean | Promise<boolean> { return !this.ownsSession || (!this.editor && !this.ptoDirty) || this.confirm.ask('Leave this editor?', 'Your unsaved changes will be discarded.', 'Leave editor', 'Keep editing'); }
    @HostListener('window:beforeunload', ['$event'])
    unload(event: BeforeUnloadEvent): void {
        if (this.ownsSession && (this.editor || this.ptoDirty)) {
            event.preventDefault();
            event.returnValue = '';
        }
    }
    async close(): Promise<void> {
        if (!this.saving() && await this.confirm.ask('Discard this draft?', 'Your changes in this editor have not been saved.', 'Discard changes', 'Keep editing')) {
            if (this.editor === 'location') this.placeSearchChanged();
            this.editor = '';
        }
    }
    open(kind: string, item?: Transport | Plan | Stay | Trip['parking'][number] | Trip['budget']['manual'][number]): void {
        this.error.set('');
        this.editingId = item?.id || null;
        this.editor = kind;
        if (kind === 'parking')
            this.parking = { place_name: '', necessary: 'unknown', booked: false, arrangement: 'self_park', address: '', confirmation: '', cost: null, currency: 'USD', notes: '', ...item } as typeof this.parking;
        if (kind === 'budget')
            this.budget = { category: 'other', label: '', amount: null, currency: 'USD', paid: false, notes: '', ...item } as typeof this.budget;
        if (kind === 'note')
            this.note = { body: '', on_date: '' };
        if (kind === 'reminder')
            this.reminder = { title: '', due_at: '', kind: 'general', notes: '', done: false };
        if (kind === 'transport')
            this.transport = item ? { ...item } : null;
        if (kind === 'activity')
            this.plan = { on_date: this.selectedDay || this.data()!.start_date, title: '', kind: 'activity', start_time: '', end_time: '', place_name: '', address: '', url: '', cost: null, currency: 'USD', paid: false, notes: '', ...item } as typeof this.plan;
        if (kind === 'destination')
            this.stay = { city: '', arrive_on: this.data()!.start_date, leave_on: this.data()!.end_date, lodging_name: '', lodging_address: '', notes: '', ...item } as typeof this.stay;
    }
    mutate(path: string, body: object, method = 'post', close = true): void {
        if (this.saving())
            return;
        this.saving.set(true);
        this.error.set('');
        const tripId = this.id;
        const ptoSnapshot = this.ptoSnapshot();
        const cleaned = Object.fromEntries(Object.entries(body).map(([key, value]) => [key, value === '' ? null : value]));
        this.http.request(method, '/travel/api' + path, { body: cleaned }).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: () => {
                if (!this.ownsSession || this.id !== tripId) return;
                this.saving.set(false);
                if (close)
                    this.editor = '';
                if ('pto_dates' in body)
                    this.ptoSaved = ptoSnapshot;
                this.message.set('Saved.');
                this.load();
            }, error: e => { if (this.ownsSession && this.id === tripId) { this.saving.set(false); this.error.set(travelError(e)); } } });
    }
    saveTransport(value: Record<string, unknown>): void { this.mutate(this.editingId ? '/transports/' + this.editingId : this.path() + '/transports', value, this.editingId ? 'patch' : 'post'); }
    savePlan(): void { this.mutate(this.editingId ? '/plans/' + this.editingId : this.path() + '/plans', this.plan, this.editingId ? 'patch' : 'post'); }
    saveStay(): void { this.mutate(this.editingId ? '/stays/' + this.editingId : this.path() + '/stays', this.stay, this.editingId ? 'patch' : 'post'); }
    async saveMeta(): Promise<void> {
        const trip = this.data()!;
        const outside = trip.stays.filter(stay => stay.arrive_on < this.meta.start_date || stay.leave_on > this.meta.end_date).length + trip.days.filter(day => day.on_date < this.meta.start_date || day.on_date > this.meta.end_date).reduce((sum, day) => sum + day.items.length, 0);
        if (outside && !await this.confirm.ask('Keep items outside the new dates?', outside + ' destinations or plans will remain outside this range. Removed PTO dates stop counting.', 'Change dates', 'Keep editing'))
            return;
        this.mutate(this.path(), this.meta, 'patch');
    }
    totalPto(): number { return this.ptoEnabled ? Object.values(this.charges).reduce((sum, amount) => sum + amount, 0) : 0; }
    weekdays(): void {
        for (const day of this.data()!.days) {
            const weekday = new Date(day.on_date + 'T12:00:00').getDay();
            this.charges[day.on_date] = weekday === 0 || weekday === 6 ? 0 : 1;
        }
    }
    clearPto(): void {
        for (const day of this.data()!.days)
            this.charges[day.on_date] = 0;
    }
    async savePto(): Promise<void> {
        if (this.data()!.pto_mode === 'legacy' && !await this.confirm.ask('Replace the legacy PTO total?', 'The recorded ' + this.data()!.pto_days_effective + ' days will be replaced by ' + this.totalPto() + ' days on the dates you selected.', 'Save dated PTO', 'Keep legacy total'))
            return;
        this.mutate(this.path(), { counts_as_pto: this.ptoEnabled, pto_dates: Object.entries(this.charges).map(([on_date, amount]) => ({ on_date, amount })) }, 'patch', false);
    }
    async remove(path: string, label: string): Promise<void> {
        if (this.saving() || !this.ownsSession) return;
        const trip = this.data()!;
        const rows: Record<string, { id: number }[]> = {
            destination: trip.stays, transport: trip.transports,
            activity: [...trip.days.flatMap(day => day.items), ...trip.outside_plans],
            parking: trip.parking, note: trip.note_entries,
            reminder: trip.reminders, cost: trip.budget.manual,
        };
        const row = rows[label]?.find(item => item.id === Number(path.split('/').at(-1)));
        if (!row) return;
        const kind = ({ destination: 'stay', activity: 'plan', cost: 'budget' } as Record<string, string>)[label] || label;
        const body = restoreBody(kind, row);
        const collection = path.split('/')[1];
        const tripId = trip.id;
        let restoring = false;
        const restore = async () => {
            if (restoring || !this.ownsSession) return;
            restoring = true;
            try {
                await firstValueFrom(this.http.post('/travel/api/trips/' + tripId + '/' + collection, body));
                if (!this.ownsSession) return;
                if (!this.destroy.destroyed && this.id === tripId) this.load();
                this.toast.success('Restored ' + label + '.');
            } catch (error) {
                if (this.ownsSession) this.toast.error(travelError(error), { label: 'Retry', run: () => { void restore(); } });
            } finally { restoring = false; }
        };
        this.saving.set(true);
        this.error.set('');
        this.http.delete('/travel/api' + path).pipe(takeUntilDestroyed(this.destroy)).subscribe({
            next: () => {
                if (!this.ownsSession) return;
                if (this.id === tripId) { this.saving.set(false); this.load(); }
                this.toast.success('Removed ' + label + '.', () => { void restore(); });
            },
            error: error => { if (this.ownsSession && this.id === tripId) { this.saving.set(false); this.error.set(travelError(error)); } },
        });
    }
    async deleteTrip(): Promise<void> {
        if (!await this.confirm.ask('Delete ' + this.data()!.title + '?', 'This removes the trip, bookings, notes and its PTO usage.', 'Delete trip', 'Keep trip'))
            return;
        this.http.delete('/travel/api' + this.path()).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: () => { this.editor = ''; this.router.navigateByUrl('/travel'); }, error: e => this.error.set(travelError(e)) });
    }
    chooseLocation(stay: Stay): void { this.placeSearchChanged(); this.placeStay = stay; this.placeQuery = stay.city; this.editor = 'location'; }
    placeSearchChanged(): void {
        this.placeRequest?.unsubscribe();
        this.finding.set(false);
        this.placeSearched.set(false);
        this.places.set([]);
        this.placeError.set('');
    }
    findPlaces(): void {
        const query = this.placeQuery.trim();
        if (!this.placeStay || this.editor !== 'location' || this.finding() || this.saving()) return;
        const stayId = this.placeStay.id;
        this.placeSearchChanged();
        if (query.length < 2 || query.length > 200) {
            this.placeError.set('Enter a place name between 2 and 200 characters.');
            return;
        }
        this.finding.set(true);
        this.placeRequest = this.http.get<{
            results: TravelPlace[];
        }>('/travel/api/places/search', { params: { q: query } }).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: r => {
                if (this.editor !== 'location' || this.placeStay?.id !== stayId || this.placeQuery.trim() !== query) return;
                this.places.set(r.results);
                this.placeSearched.set(true);
                this.finding.set(false);
            }, error: e => { this.placeError.set(travelError(e)); this.finding.set(false); } });
    }
    selectPlace(place: TravelPlace): void {
        if (this.placeStay && !this.finding() && this.places().includes(place))
            this.mutate('/stays/' + this.placeStay.id, { ...this.placeStay, lat: place.lat, lng: place.lng }, 'patch');
    }
    reminderDone(reminder: Trip['reminders'][number]): void { this.mutate('/reminders/' + reminder.id, { ...reminder, done: !reminder.done }, 'patch', false); }
    saveParking(): void { this.mutate(this.editingId ? '/parking/' + this.editingId : this.path() + '/parking', this.parking, this.editingId ? 'patch' : 'post'); }
    saveBudget(): void { this.mutate(this.editingId ? '/budget-lines/' + this.editingId : this.path() + '/budget-lines', this.budget, this.editingId ? 'patch' : 'post'); }
    endpoint(suffix: string): string { return this.path() + suffix; }
    hasPlans(): boolean { return this.data()?.days.some(day => day.items.length > 0) || false; }
}
