import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  OnChanges,
  ViewChild,
  afterNextRender,
  inject,
} from "@angular/core";
import type { CircleMarker, Map as LeafletMap, TileLayer } from "leaflet";
export interface TravelPlace {
  label: string;
  lat: number | null;
  lng: number | null;
}
@Component({
  selector: "travel-map",
  standalone: true,
  template: `<section aria-label="Trip map">
    <div class="map-toolbar">
      <h2>Places</h2>
      @if (map) {
        <button
          class="btn"
          type="button"
          aria-label="Zoom in"
          (click)="map.zoomIn()"
        >
          +
        </button>
        <button
          class="btn"
          type="button"
          aria-label="Zoom out"
          (click)="map.zoomOut()"
        >
          −
        </button>
      }
    </div>
    <div
      #canvas
      class="map-canvas"
      tabindex="0"
      aria-label="Interactive trip map. Use arrow keys to pan and plus or minus to zoom."
    ></div>
    <p role="status">{{ status }}</p>
    @if (initializationFailed) {
      <button class="btn" type="button" (click)="reload()">
        Reload map page
      </button>
    } @else if (failed) {
      <button class="btn" type="button" (click)="retry()">Retry map</button>
    }
    <p class="map-attribution">
      Map data ©
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        >OpenStreetMap contributors</a
      >
      · Map by Leaflet
    </p>
    <ul class="place-list">
      @for (place of places; track $index) {
        <li>
          <span>{{ place.label }}</span>
          @if (valid(place)) {
            <button class="btn" type="button" (click)="show($index)">
              Show on map
            </button>
            <a
              [href]="external(place)"
              target="_blank"
              rel="noopener noreferrer"
              >Open map<span class="visually-hidden"> in a new tab</span></a
            >
          } @else {
            <span>Location has not been chosen.</span>
          }
        </li>
      }
    </ul>
  </section>`,
  styles: [
    `
      .map-canvas {
        height: 22rem;
        min-height: 16rem;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        isolation: isolate;
      }
      .map-toolbar {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      .map-toolbar h2 {
        margin-right: auto;
      }
      .map-attribution {
        font-size: 0.8rem;
      }
      .place-list {
        padding: 0;
        list-style: none;
      }
      .place-list li {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.75rem;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--border);
      }
      @media (max-width: 640px) {
        .map-canvas {
          height: 17rem;
        }
      }
    `,
  ],
})
export class MapComponent implements OnChanges {
  @Input()
  places: TravelPlace[] = [];
  @ViewChild("canvas", { static: true })
  canvas!: ElementRef<HTMLDivElement>;
  private readonly change = inject(ChangeDetectorRef);
  private readonly destroy = inject(DestroyRef);
  private library: typeof import("leaflet") | null = null;
  private tiles?: TileLayer;
  private pins = new Map<number, CircleMarker>();
  private painted = "";
  private loading = true;
  private selected = "";
  map: LeafletMap | null = null;
  failed = false;
  initializationFailed = false;
  get status(): string {
    const state = this.initializationFailed
      ? "The map could not start. Your place list and map links are still available."
      : this.failed
        ? "Map tiles could not load. Your place list and map links are still available."
        : this.loading
          ? "Loading map…"
          : this.pins.size
            ? `Map ready. ${this.pins.size} chosen location${this.pins.size === 1 ? "" : "s"}.`
            : "Choose a location to add it to the map.";
    return this.selected ? state + " " + this.selected : state;
  }
  constructor() {
    afterNextRender(() => {
      void this.initialize();
    });
    this.destroy.onDestroy(() => {
      this.tiles?.off();
      this.map?.remove();
      this.map = null;
      this.pins.clear();
    });
  }
  ngOnChanges(): void {
    this.paintPlaces();
  }
  valid(place: TravelPlace): boolean {
    return (
      place.lat !== null &&
      place.lng !== null &&
      Number.isFinite(place.lat) &&
      Number.isFinite(place.lng) &&
      Math.abs(place.lat) <= 90 &&
      Math.abs(place.lng) <= 180
    );
  }
  external(place: TravelPlace): string {
    return `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=12/${place.lat}/${place.lng}`;
  }
  private async initialize(): Promise<void> {
    try {
      const { default: library } = await import("../vendor/leaflet.mjs");
      if (this.destroy.destroyed) return;
      this.library = library;
      this.map = library
        .map(this.canvas.nativeElement, {
          zoomControl: false,
          attributionControl: false,
        })
        .setView([20, 0], 2);
      this.tiles = library.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          // OSM receives the site origin, never a private trip path or query.
          referrerPolicy: "origin",
        },
      );
      this.tiles.on("tileerror", () => {
        this.failed = true;
        this.change.markForCheck();
      });
      this.tiles.on("loading", () => {
        this.loading = true;
        this.change.markForCheck();
      });
      this.tiles.on("load", () => {
        this.loading = false;
        this.change.markForCheck();
      });
      this.paintPlaces();
    } catch {
      if (this.destroy.destroyed) return;
      this.initializationFailed = true;
      this.change.markForCheck();
    }
  }
  private paintPlaces(): void {
    const map = this.map;
    const library = this.library;
    if (!map || !library) return;
    const places = JSON.stringify(this.places);
    if (places === this.painted) return;
    this.painted = places;
    this.selected = "";
    this.pins.forEach((pin) => pin.remove());
    this.pins.clear();
    this.places.forEach((place, index) => {
      if (!this.valid(place)) return;
      const label = document.createElement("span");
      label.textContent = place.label;
      const pin = library
        .circleMarker([place.lat!, place.lng!], { radius: 8 })
        .bindPopup(label)
        .addTo(map);
      this.pins.set(index, pin);
    });
    if (this.pins.size) {
      map.fitBounds(library.featureGroup([...this.pins.values()]).getBounds(), {
        padding: [30, 30],
        maxZoom: 12,
      });
      if (this.tiles && !map.hasLayer(this.tiles)) this.tiles.addTo(map);
    } else {
      if (this.tiles && map.hasLayer(this.tiles)) map.removeLayer(this.tiles);
      this.loading = false;
      this.failed = false;
    }
    this.change.markForCheck();
  }
  show(index: number): void {
    const pin = this.pins.get(index);
    if (!pin || !this.map) return;
    this.map.invalidateSize();
    this.map.setView(pin.getLatLng(), 12);
    pin.openPopup();
    this.focusCanvas();
    this.selected = `Showing ${this.places[index].label}.`;
  }
  private focusCanvas(): void {
    const canvas = this.canvas.nativeElement;
    canvas.scrollIntoView({ block: "center", behavior: "instant" });
    canvas.focus({ preventScroll: true });
  }
  reload(): void {
    window.location.reload();
  }
  retry(): void {
    this.failed = false;
    this.loading = true;
    if (this.map) {
      this.focusCanvas();
      this.tiles?.redraw();
    } else void this.initialize();
  }
}
