import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface PlaceCrumb {
  readonly label: string;
  readonly href?: string;
  readonly query?: Readonly<Record<string, string | null>> | null;
}

@Component({
  selector: 'app-town-place',
  imports: [RouterLink],
  templateUrl: './town-place.component.html',
  styleUrl: './town-place.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownPlaceComponent {
  readonly crumbs = input.required<readonly PlaceCrumb[]>();
}
