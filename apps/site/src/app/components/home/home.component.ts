import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="page page--home" id="main-content" tabindex="-1">
      <header class="home-intro">
        <p class="home-intro__role">Software Engineer · SpaceX · Aug 2025–Present</p>
        <h1 class="home-intro__title">Vivek Panchagnula</h1>
        <p class="home-intro__summary">Software, infrastructure, and AI.</p>
        <nav class="home-intro__links" aria-label="Contact and site links">
          <a href="mailto:vivek.panchagnula@gmail.com">Email</a>
          <a href="https://github.com/Vivekpsps3" target="_blank" rel="noopener noreferrer">GitHub <span class="visually-hidden">(opens in a new tab)</span></a>
          <a href="https://linkedin.com/in/vivek-panchagnula" target="_blank" rel="noopener noreferrer">LinkedIn <span class="visually-hidden">(opens in a new tab)</span></a>
          <a routerLink="/about">About</a>
        </nav>
      </header>

      <section class="home-work" aria-labelledby="home-work-title">
        <div class="home-work__heading">
          <h2 id="home-work-title">Selected work</h2>
          <a routerLink="/work">All work <span aria-hidden="true">→</span></a>
        </div>
        <div class="work-list">
          <article class="work-entry">
            <div class="work-entry__heading">
              <p class="work-entry__role">SpaceX · Infrastructure</p>
            </div>
            <div class="work-entry__copy">
              <h3>Multi-region operations infrastructure</h3>
              <p>Led a multi-region Kubernetes migration supporting production users and global operations.</p>
              <a routerLink="/work" fragment="multi-region" aria-label="Read about multi-region operations infrastructure">Explore <span aria-hidden="true">→</span></a>
            </div>
          </article>
          <article class="work-entry">
            <div class="work-entry__heading">
              <p class="work-entry__role">SpaceX · AI tools</p>
            </div>
            <div class="work-entry__copy">
              <h3>Code review and operations support</h3>
              <p>Built AI code review and operator-reviewed triage tools.</p>
              <a routerLink="/work" fragment="ai-tools" aria-label="Read about AI tools">Explore <span aria-hidden="true">→</span></a>
            </div>
          </article>
          <article class="work-entry">
            <div class="work-entry__heading">
              <p class="work-entry__role">ExxonMobil · Applied machine learning</p>
              <p class="details">May–Aug 2025</p>
            </div>
            <div class="work-entry__copy">
              <h3>Iterative retrieval and analytics</h3>
              <p>Built retrieval and analytics over 1M+ internal records; later adopted in production.</p>
              <a routerLink="/work" fragment="exxonmobil" aria-label="Read about ExxonMobil work">Explore <span aria-hidden="true">→</span></a>
            </div>
          </article>
        </div>
      </section>
    </main>
  `,
})
export class HomeComponent {}
