import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const hostname = '127.0.0.1';
const port = 4176;
const html = await readFile(new URL('../tests/manual/clipboard-check.html', import.meta.url));

const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed');
    return;
  }
  if (request.url !== '/' && request.url !== '/clipboard-check.html') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : 'Not found');
    return;
  }

  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length });
  response.end(request.method === 'HEAD' ? undefined : html);
});

server.on('error', (error) => {
  console.error(`Clipboard check server could not start: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, hostname, () => {
  console.log(`Clipboard check: http://${hostname}:${port}/clipboard-check.html`);
  console.log('Only this local fixture is served. Press Ctrl+C to stop.');
});
