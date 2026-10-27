import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes, RenderMode } from '@angular/ssr';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

const config = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering(withRoutes([
    ...['', 'home', 'work', 'about', 'secrets'].map(path => ({ path, renderMode: RenderMode.Prerender as const })),
    { path: '**', renderMode: RenderMode.Client },
  ]))],
});

export default (context: BootstrapContext) => bootstrapApplication(AppComponent, config, context);
