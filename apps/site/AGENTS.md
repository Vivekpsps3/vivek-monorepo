# Public portfolio site

Follow the [root handoff](../../AGENTS.md). The app overview is in [README.md](README.md).

- This Angular app is the public portfolio site; keep its routes, page content, and styles within apps/site.
- Route titles and descriptions belong in src/app/app.routes.ts. Shared navigation and theme controls belong in src/app/app.component.html.
- Page content belongs in its matching component under src/app/components. Site layout stays in src/styles.css and src/app/app.component.css.
- Use shared design tokens from packages/ui/kit.css. Preserve the /blog redirect to /home.
- Build from apps/site with npx ng build --configuration development.
