import { ApplicationConfig, SecurityContext } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideMarkdown, MARKED_OPTIONS, SANITIZE } from 'ngx-markdown';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({
      anchorScrolling: 'enabled',
      scrollPositionRestoration: 'enabled',
    })),
    provideClientHydration(),
    provideMarkdown({
      sanitize: {
        provide: SANITIZE,
        useValue: SecurityContext.HTML,
      },
      markedOptions: {
        provide: MARKED_OPTIONS,
        useValue: {
          gfm: true,
          breaks: true,
          pedantic: false,
        },
      },
    })
  ]
};
