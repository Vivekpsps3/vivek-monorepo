import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiButtonComponent, UiCardComponent } from '@vivek/ui';

@Component({
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent],
  template: `
    <h1>Game</h1>
    <ui-card>
      <h2>Town and World</h2>
      <p>Scene motion follows your device’s reduced motion preference. Harbor Rhythm keeps an untimed sequence for that preference.</p>
      <ui-button variant="secondary" href="/town/rhythm" label="Harbor Rhythm" />
      <ui-button variant="secondary" href="/settings/appearance" label="Color theme" />
      <ui-button variant="ghost" href="/town" label="Open Town" />
    </ui-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameSectionComponent {}
