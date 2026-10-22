// Static server for the production finance bundle. Unknown paths return
// index.html so Angular routes such as /login survive a refresh.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4173);
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

function insideRoot(file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(root, pathname));
  if (!insideRoot(file)) {
    send(response, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (!error) {
      send(response, 200, data, types[path.extname(file)] ?? 'application/octet-stream');
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

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
