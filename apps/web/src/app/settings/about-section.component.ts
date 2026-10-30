import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-about-section',
  standalone: true,
  template: '<h1>About</h1>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Admin metrics have no build SHA, so nothing is shown under the heading. */
export class AboutSectionComponent {}
