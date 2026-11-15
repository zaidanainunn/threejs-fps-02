// A tiny static server for game/ (Node 22, standard library only), so the
// entry can be played locally without a build step:
//
//   node serve.ts            serves game/ on http://localhost:8080
//   node serve.ts --port 9000
//
// It sends the MIME types a browser game needs, refuses any path outside
// game/, and otherwise does nothing clever: a development convenience,
// not a web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path === '/' || path === sep) path = 'index.html';
  const file = resolve(join(root, path));
  if (!file.startsWith(root + sep) && file !== root) {
    response.writeHead(403);
    response.end('forbidden');
    return;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  if (!stat.isFile()) {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`OPERATION ZERO at http://localhost:${port} — serving game/`);
});
