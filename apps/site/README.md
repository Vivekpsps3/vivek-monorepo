# Personal site

This is the Angular site for Vivek Panchagnula's public portfolio.

## Run and build

From `apps/site`, install dependencies and start the local server:

```bash
npm install
npm start
```

The development site runs at `http://localhost:4200/`.
The dev server disables dependency prebundling because the workspace's Angular path aliases otherwise load a duplicate Angular runtime and render a blank page. This setting affects local development only.

Build the site with:

```bash
npx ng build --configuration development
```

The build writes to `dist/personal-website`.

## Content ownership

- `src/app/app.routes.ts` owns routes, page titles, and route descriptions.
- `src/app/app.component.html` owns the shared navigation, theme controls, and skip link.
- `src/app/components/home/` owns the homepage introduction and selected-work previews.
- `src/app/components/work/` owns the employment stories and selected projects.
- `src/app/components/about/` owns education, employment history, and skills.
- `src/app/components/secrets/` owns the `/secrets` encryption demo UI; `src/app/services/ecdh.service.ts` owns its browser-side key exchange and prompt encryption.
- `src/styles.css` and `src/app/app.component.css` own site-specific layout and responsive rules. They use shared design tokens from `packages/ui/kit.css`.

`/blog` redirects to `/home` to preserve old links. Keep that redirect if the retired blog route changes again.
