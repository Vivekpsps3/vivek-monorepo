import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="page page--home" id="main-content" tabindex="-1">
      <header class="home-intro">
        <p class="eyebrow">Software Engineer · SpaceX · Aug 2025–Present</p>
        <h1 class="home-intro__title">Vivek Panchagnula</h1>
        <p class="home-intro__summary">I build production applications, distributed infrastructure, and AI tools for engineering and operations.</p>
        <nav class="home-intro__links" aria-label="Contact and site links">
          <a href="mailto:vivek.panchagnula@gmail.com">Email</a>
          <a href="https://github.com/Vivekpsps3" target="_blank" rel="noopener noreferrer">GitHub <span class="visually-hidden">(opens in a new tab)</span></a>
          <a href="https://linkedin.com/in/vivek-panchagnula" target="_blank" rel="noopener noreferrer">LinkedIn <span class="visually-hidden">(opens in a new tab)</span></a>
          <a routerLink="/about">About</a>
        </nav>
      </header>

      <section class="home-work" aria-labelledby="home-work-title">
        <div class="home-work__heading">
          <div>
            <p class="eyebrow">Selected work</p>
            <h2 id="home-work-title">Systems and applied AI</h2>
          </div>
          <a routerLink="/work">All work <span aria-hidden="true">↗</span></a>
        </div>
        <div class="preview-grid">
          <article class="ui-card preview-card">
            <p class="preview-card__meta">SpaceX · Infrastructure</p>
            <h3>Multi-region operational systems</h3>
            <p>Led a single-to-multi-region Kubernetes migration supporting production users and global operational data processing.</p>
            <a routerLink="/work" fragment="multi-region">Read about the work <span aria-hidden="true">↗</span></a>
          </article>
          <article class="ui-card preview-card">
            <p class="preview-card__meta">SpaceX · AI tools</p>
            <h3>Code review and operations support</h3>
            <p>Built multi-agent code-review tools and AI-assisted triage that prepares findings for engineer review.</p>
            <a routerLink="/work" fragment="ai-tools">Read about the work <span aria-hidden="true">↗</span></a>
          </article>
          <article class="ui-card preview-card">
            <p class="preview-card__meta">ExxonMobil · Applied ML</p>
            <h3>Iterative retrieval and analytics</h3>
            <p>Built a Python and Hugging Face retrieval-augmented application over more than one million internal records, later adopted into production by internal teams.</p>
            <a routerLink="/work" fragment="exxonmobil">Read about the work <span aria-hidden="true">↗</span></a>
          </article>
        </div>
      </section>

      <section class="editorial-section home-note" aria-labelledby="home-note-title">
        <h2 id="home-note-title">On this site</h2>
        <p>Browse my <a routerLink="/work">work</a> and <a routerLink="/about">background</a>, or try the <a routerLink="/secrets">encryption demo</a>.</p>
      </section>
    </main>
  `,
})
export class HomeComponent {}
