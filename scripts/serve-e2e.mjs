import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 4173;
const ROUTES = new Map([
    ['/fixture.html', resolve(ROOT, 'tests/e2e/fixture.html')],
    ['/chrome-mock.js', resolve(ROOT, 'tests/e2e/chrome-mock.js')],
    ['/navigation.js', resolve(ROOT, 'tests/e2e/navigation.js')],
    ['/content.js', resolve(ROOT, 'dist/chrome-extension/content.js')],
    ['/options.js', resolve(ROOT, 'dist/chrome-extension/options.js')],
    ['/options.css', resolve(ROOT, 'dist/chrome-extension/options.css')],
    ['/icons/icon-32.png', resolve(ROOT, 'dist/chrome-extension/icons/icon-32.png')],
    ['/icons/icon-128.png', resolve(ROOT, 'dist/chrome-extension/icons/icon-128.png')],
    ['/privacy.html', resolve(ROOT, 'dist/chrome-extension/privacy.html')]
]);
const MIME = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png'
};

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
        let body;
        let extension;
        if (url.pathname === '/options.html') {
            body = await readFile(resolve(ROOT, 'dist/chrome-extension/options.html'), 'utf8');
            body = body.replace(
                '<script src="options.js"></script>',
                '<script src="/chrome-mock.js"></script>\n  <script src="options.js"></script>'
            );
            extension = '.html';
        } else {
            const path = ROUTES.get(url.pathname === '/' ? '/fixture.html' : url.pathname);
            if (!path) {
                response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
                response.end('Not found');
                return;
            }
            extension = extname(path);
            body = await readFile(path);
        }
        response.writeHead(200, {
            'content-type': MIME[extension] || 'application/octet-stream',
            'cache-control': 'no-store',
            'content-security-policy': "default-src 'self'; img-src 'self' https://*.cdninstagram.com data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
        });
        response.end(body);
    } catch (error) {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(error.message);
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Threads Plugin E2E fixture ready at http://127.0.0.1:${PORT}`);
});
