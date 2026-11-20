import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AtlasLine } from './atlas';

@Component({
  selector: 'app-atlas-note',
  standalone: true,
  templateUrl: './atlas-note.component.html',
  styleUrl: './atlas.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtlasNoteComponent {
  lines = input.required<readonly AtlasLine[]>();
}
