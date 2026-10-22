// Static server for the production finance bundle.
// Extensionless paths fall back to index.html so Angular routes survive a refresh.
// Missing JS, CSS, and other assets 404. A mount prefix (for example /finance)
// maps that URL prefix onto the bundle, and /hub and /auth stay outside it.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function send(res, status, body, contentType) {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function insideRoot(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function normalizeMount(mount) {
  if (!mount || mount === '/') return '';
  const withSlash = mount.startsWith('/') ? mount : `/${mount}`;
  return withSlash.replace(/\/$/, '');
}

function isSharedRoute(pathname) {
  return pathname === '/hub' || pathname.startsWith('/hub/')
    || pathname === '/auth' || pathname.startsWith('/auth/');
}

function hasExtension(localPath) {
  return path.posix.basename(localPath).includes('.');
}

// Returns a path relative to the bundle root, or null when the URL is outside
// this server. /hub and /auth are the shell even when the bundle is mounted.
export function mapRequestPath(pathname, mount) {
  let local = pathname;
  if (mount) {
    if (pathname === mount || pathname.startsWith(`${mount}/`)) {
      local = pathname.slice(mount.length) || '/';
    } else if (isSharedRoute(pathname)) {
      return 'index.html';
    } else {
      return null;
    }
  }
  if (local.endsWith('/')) local += 'index.html';
  return local.replace(/^\/+/, '');
}

export function createSpaServer(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  const mount = normalizeMount(options.mount ?? '');
  return http.createServer((request, response) => {
    let pathname;
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      pathname = decodeURIComponent(url.pathname);
    } catch {
      send(response, 400, 'Bad request', 'text/plain; charset=utf-8');
      return;
    }
    const mapped = mapRequestPath(pathname, mount);
    if (mapped == null) {
      send(response, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }
    const file = path.normalize(path.join(root, mapped));
    if (!insideRoot(root, file)) {
      send(response, 403, 'Forbidden', 'text/plain; charset=utf-8');
      return;
    }
    fs.readFile(file, (error, data) => {
      if (!error) {
        send(response, 200, data, types[path.extname(file)] ?? 'application/octet-stream');
        return;
      }
      if (hasExtension(mapped)) {
        send(response, 404, 'Not found', 'text/plain; charset=utf-8');
        return;
      }
      fs.readFile(path.join(root, 'index.html'), (indexError, indexData) => {
        if (indexError) {
          send(response, 404, 'Not found', 'text/plain; charset=utf-8');
          return;
        }
        send(response, 200, indexData, 'text/html; charset=utf-8');
      });
    });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = path.resolve(process.argv[2] ?? 'dist');
  const port = Number(process.argv[3] ?? 4173);
  const mount = process.argv[4] ?? '';
  const server = createSpaServer(root, { mount });
  server.listen(port, '127.0.0.1', () => {
    const prefix = normalizeMount(mount);
    console.log(`Serving ${root} at http://127.0.0.1:${port}${prefix}/`);
  });
}
