import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReturnContext, UiButtonComponent, UiDialogComponent, UiIconComponent, type UiIconName } from '@vivek/ui';

const destinations = [
  { id: 'finance', label: 'Holdings', path: '/finance/have?t=holdings', icon: 'wallet' },
  { id: 'travel', label: 'Trips', path: '/travel', icon: 'calendar' },
  { id: 'media', label: 'Library', path: '/media/library', icon: 'book' },
  { id: 'health', label: 'Health', path: '/town/clinic', icon: 'trending' },
  { id: 'pixels', label: 'Pixels', path: '/pixels', icon: 'grid' },
  { id: 'town', label: 'Town', path: '/town', icon: 'building' },
  { id: 'review', label: 'Weekly review', path: '/town/review', icon: 'document' },
] as const satisfies readonly { id: string; label: string; path: string; icon: UiIconName }[];
type DestinationId = typeof destinations[number]['id'];

const maxPins = 3;
const storageKey = (ownerId: number) => `hub.pins.v1.${ownerId}`;

function readPins(ownerId: number | null): readonly DestinationId[] {
  if (ownerId === null) return [];
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    if (!raw || raw.length > 128) return [];
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids)].filter((id): id is DestinationId => destinations.some(destination => destination.id === id)).slice(0, maxPins);
  } catch {
    return [];
  }
}

@Component({
  selector: 'app-hub-destinations',
  standalone: true,
  imports: [RouterLink, UiButtonComponent, UiDialogComponent, UiIconComponent],
  template: `
    <nav aria-labelledby="hub-destinations-heading">
      <div class="heading">
        <h2 id="hub-destinations-heading">Shortcuts</h2>
        <ui-button variant="ghost" [disabled]="ownerId() === null" (clicked)="edit()">Edit pins</ui-button>
      </div>
      <ul>
        @for (tile of tiles(); track tile.id) {
          <li>
            <a class="tile" [routerLink]="tile.url" [state]="tile.id === 'review' ? reviewSource() : undefined" [class.pinned]="pins().includes(tile.id)">
              <ui-icon [name]="tile.icon" />
              <span>{{ tile.label }}</span>
              @if (pins().includes(tile.id)) { <ui-icon class="pin" size="sm" name="check" /> }
            </a>
          </li>
        }
      </ul>
    </nav>

    <ui-dialog [open]="editing()" labelledBy="hub-pins-title" describedBy="hub-pins-help" (closed)="close()">
      <h2 id="hub-pins-title">Edit pins</h2>
      <p id="hub-pins-help">Pin up to {{ maxPins }} shortcuts to the front on this device.</p>
      <div class="pin-options" role="group" aria-label="Available shortcuts">
        @for (tile of options; track tile.id) {
          <ui-button variant="secondary" [pressed]="pins().includes(tile.id)"
            [disabled]="pins().length >= maxPins && !pins().includes(tile.id)" (clicked)="toggle(tile.id)">{{ tile.label }}</ui-button>
        }
      </div>
      @if (saveFailed()) { <p role="status">Changes could not be saved on this device.</p> }
      <div class="dialog-actions">
        <ui-button variant="secondary" (clicked)="save([])">Reset pins</ui-button>
        <ui-button (clicked)="close()">Done</ui-button>
      </div>
    </ui-dialog>
  `,
  styleUrl: './hub-destinations.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubDestinationsComponent {
  readonly ownerId = input.required<number | null>();
  private readonly router = inject(Router);
  private readonly returns = inject(ReturnContext);
  protected readonly options = destinations;
  protected readonly maxPins = maxPins;
  protected readonly pins = linkedSignal(() => readPins(this.ownerId()));
  private readonly editingOwner = linkedSignal<number | null, number | null>({ source: this.ownerId, computation: () => null });
  protected readonly editing = computed(() => this.editingOwner() !== null && this.editingOwner() === this.ownerId());
  protected readonly saveFailed = signal(false);
  private readonly links = destinations.map(destination => ({
    ...destination, url: this.router.parseUrl(destination.path),
  }));
  protected readonly tiles = computed(() => {
    const pins = this.pins();
    const pinned = pins.flatMap(id => this.links.filter(tile => tile.id === id));
    return [...pinned, ...this.links.filter(tile => !pins.includes(tile.id))];
  });

  protected reviewSource(): Record<string, unknown> {
    return this.returns.link(this.router.url);
  }

  protected edit(): void {
    this.saveFailed.set(false);
    this.editingOwner.set(this.ownerId());
  }

  protected close(): void {
    this.editingOwner.set(null);
  }

  protected toggle(id: DestinationId): void {
    const pins = this.pins();
    if (pins.includes(id)) this.save(pins.filter(pin => pin !== id));
    else if (pins.length < maxPins) this.save([...pins, id]);
  }

  protected save(pins: readonly DestinationId[]): void {
    const ownerId = this.ownerId();
    if (ownerId === null || !this.editing()) return;
    this.pins.set(pins);
    try {
      const key = storageKey(ownerId);
      if (pins.length) localStorage.setItem(key, JSON.stringify(pins));
      else localStorage.removeItem(key);
      this.saveFailed.set(false);
    } catch {
      this.saveFailed.set(true);
    }
  }
}
