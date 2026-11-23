import { ChangeDetectionStrategy, Component } from '@angular/core';
import { KeepsakeShelfComponent } from './keepsake-shelf.component';
import { TownPlaceComponent, type PlaceCrumb } from './town-place.component';

@Component({
  selector: 'app-keepsake-page',
  imports: [KeepsakeShelfComponent, TownPlaceComponent],
  templateUrl: './keepsake-page.component.html',
  styleUrl: './keepsake-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeepsakePageComponent {
  readonly crumbs: readonly PlaceCrumb[] = [
    { label: 'Town', href: '/town' },
    { label: 'Keepsake shelf' },
  ];
}
