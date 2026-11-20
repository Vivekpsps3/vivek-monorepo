import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CompactMemoryPreview } from './atlas';

@Component({
  selector: 'app-memory-preview',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './memory-preview.component.html',
  styleUrl: './atlas.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryPreviewComponent {
  preview = input.required<CompactMemoryPreview>();
}
