import { Routes } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes as pages } from './app/app.routes';

export const routes: Routes = [{ path: '', component: AppComponent, children: pages }];
