import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PLANNING_DESTINATIONS } from './planning-destinations';

@Component({
  selector: 'app-planning-tool-index',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './planning-tool-index.component.html',
  styleUrl: './planning-tool-index.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningToolIndexComponent {
  @Input() compact = false;
  readonly tools = PLANNING_DESTINATIONS;
  readonly activeOptions = {
    paths: 'exact' as const,
    queryParams: 'ignored' as const,
    matrixParams: 'ignored' as const,
    fragment: 'ignored' as const,
  };
}
