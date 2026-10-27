import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { translateLegacyLocation } from './app/platform/legacy-routes.mjs';

const legacy = translateLegacyLocation(window.location.href);
if (legacy) window.history.replaceState(null, '', legacy);
bootstrapApplication(AppComponent, appConfig).catch(error => console.error(error));
