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

## Encryption demo backend

The `/secrets` page uses the separate Socket.IO service in `flask/`. Install its
bounded Python dependencies and run the local demo from that directory:

```bash
cd apps/site/flask
python -m pip install -r requirements-dev.txt
SITE_ALLOWED_ORIGINS=http://localhost:4200 python server.py
```

The server accepts only the two local Angular origins by default. Set
`SITE_ALLOWED_ORIGINS` to a comma-separated list of exact site origins in each
deployment, for example `https://vivekpanchagnula.com`; wildcard origins are
rejected. `SITE_DEBUG` defaults to `false`. The built-in server is for local
development. A production deployment can serve the Socket.IO Flask app with
Gunicorn's threaded worker (one worker keeps Socket.IO sessions in one process):

```bash
cd apps/site/flask
SITE_ALLOWED_ORIGINS=https://vivekpanchagnula.com \
  gunicorn --workers 1 --threads 100 --bind 0.0.0.0:5000 server:app
```

The encryption demo protects the browser-to-demo-server transport. The Flask
server decrypts the prompt and passes its plaintext to the configured local
Ollama model, so the server can read it. This demo is separate from Finance and
does not access Finance data. Tests inject a fake model response and make no
model or network requests.

The optional OpenAI-compatible adapter is `flask/api.py`; it loads its
GitHub-backed chat client only when a chat request arrives. It shares the same
`SITE_ALLOWED_ORIGINS` setting. Run `python -m src.chat` interactively to
authorize its GitHub Copilot client; the token is stored under
`$XDG_CONFIG_HOME/vivek-site/` (or `~/.config/vivek-site/`) outside the repo.

## Content ownership

- `src/app/app.routes.ts` owns routes, page titles, and route descriptions.
- `src/app/app.component.html` owns the shared navigation, theme controls, and skip link.
- `src/app/components/home/` owns the homepage introduction and selected-work previews.
- `src/app/components/work/` owns the employment stories and selected projects.
- `src/app/components/about/` owns education, employment history, and skills.
- `src/app/components/secrets/` owns the `/secrets` encryption demo UI; `src/app/services/ecdh.service.ts` owns its browser-side key exchange and prompt encryption.
- `src/styles.css` and `src/app/app.component.css` own site-specific layout and responsive rules. They use shared design tokens from `packages/ui/kit.css`.

`/blog` redirects to `/home` to preserve old links. Keep that redirect if the retired blog route changes again.
