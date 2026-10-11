import { Routes } from '@angular/router';
import { AboutComponent } from './components/about/about.component';
import { HomeComponent } from './components/home/home.component';
import { SecretsComponent } from './components/secrets/secrets.component';
import { WorkComponent } from './components/work/work.component';

export const routes: Routes = [
  {
    path: 'home',
    component: HomeComponent,
    title: 'Home · Vivek Panchagnula',
    data: { description: 'Vivek Panchagnula is a SpaceX software engineer building production applications, distributed infrastructure, and AI tools for engineering and operations.' },
  },
  {
    path: 'work',
    component: WorkComponent,
    title: 'Work · Vivek Panchagnula',
    data: { description: 'Selected work in multi-region infrastructure, reviewed alerting, AI engineering tools, and applied machine learning.' },
  },
  {
    path: 'about',
    component: AboutComponent,
    title: 'About · Vivek Panchagnula',
    data: { description: 'Experience, education, and skills across software engineering, applied AI, and computer systems.' },
  },
  { path: 'blog', redirectTo: '/home', pathMatch: 'full' },
  {
    path: 'secrets',
    component: SecretsComponent,
    title: 'Encryption demo · Vivek Panchagnula',
    data: { description: 'An interactive ECDH and AES-GCM demo: the browser encrypts a prompt, the server decrypts it, and the LLM reply returns as ordinary text.' },
  },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
];
