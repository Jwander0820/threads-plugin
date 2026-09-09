import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Uses real build CSS/SVGs. Query: ?target=userscript|extension|source&reverse=1
const root = resolve(import.meta.dirname, '..');
const targets = {
    source: 'src/shared/threads-runtime.js',
    userscript: 'threads-plugin.user.js',
    extension: 'dist/chrome-extension/content.js'
};
const controls = [
    ['POST_TOOL_CLASS', 'ensureDetailButton', 'button', 'Download'],
    ['COPY_TOOL_CLASS', 'createCopyToolButton', 'copyButton', 'Copy text'],
    ['LINK_TOOL_CLASS', 'createLinkToolButton', 'linkButton', 'Copy link']
];

function renderFixture(source, reverse) {
    const constants = Object.fromEntries(
        [...source.matchAll(/const (\w+) = ["']([^"'\r\n]*)["'];/g)].map((match) => [match[1], match[2]])
    );
    const expand = (template) => template.replace(/\$\{(\w+)\}/g, (_, name) => {
        if (!(name in constants)) throw new Error(`Unknown CSS/SVG constant: ${name}`);
        return constants[name];
    });
    const css = expand(source.match(/const PLUGIN_CSS = `([\s\S]*?)`;/)[1]);
    const selectors = controls.map(([name]) => `.${constants[name]}`);
    const legacy = `${selectors.join(',')} { color: rgb(228,230,235) !important; }
        ${selectors.map((selector) => `${selector}:hover`).join(',')} {
            background: rgba(255,255,255,0.08) !important;
        }`;
    const buttons = controls.map(([name, functionName, variable, label]) => {
        const body = source.slice(source.indexOf(`function ${functionName}(`));
        const markup = body.match(new RegExp(variable + '\\.innerHTML = `([\\s\\S]*?)`;'))[1];
        const prefix = body.slice(0, body.indexOf(`${variable}.innerHTML`));
        const themed = /setAttribute\(["']data-tm-theme-aware["'], ["']1["']\)/.test(prefix);
        return `<button aria-label="${label}" class="${constants[name]}" ${themed ? 'data-tm-theme-aware="1"' : ''}>${expand(markup)}</button>`;
    }).join('');
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Theme regression</title>
        <style>
            :root { --icon-primary: rgb(0,0,0); background: white; color: #e4e6eb; }
            :root.dark { --icon-primary: rgb(243,245,247); background: #101010; }
            body { font: 16px system-ui; padding: 32px; }
            #controls { display: flex; gap: 12px; margin: 24px 0; }
            #result { color: var(--icon-primary); white-space: pre-wrap; }
        </style>
        <style>${reverse ? legacy : css}</style><style>${reverse ? css : legacy}</style>
        <button id="theme">Switch theme</button><div id="controls">${buttons}</div><pre id="result"></pre>
        <script>
            function check() {
                const expected = document.documentElement.classList.contains('dark')
                    ? 'rgb(243, 245, 247)' : 'rgb(0, 0, 0)';
                const results = [...document.querySelectorAll('#controls button')].map(button => {
                    const shape = button.querySelector('path, rect');
                    const style = getComputedStyle(shape);
                    const color = button.getAttribute('aria-label') === 'Copy link' ? style.fill : style.stroke;
                    return { label: button.getAttribute('aria-label'), color, pass: color === expected };
                });
                document.querySelector('#result').textContent = JSON.stringify({
                    pass: results.every(result => result.pass), expected, results
                }, null, 2);
            }
            document.querySelector('#theme').onclick = () => {
                document.documentElement.classList.toggle('dark');
                check();
            };
            check();
        </script></html>`;
}

createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://127.0.0.1:4174');
        const target = url.searchParams.get('target') || 'source';
        if (!Object.hasOwn(targets, target)) {
            response.writeHead(400).end('Unknown target');
            return;
        }
        const source = await readFile(resolve(root, targets[target]), 'utf8');
        const html = renderFixture(source, url.searchParams.has('reverse'));
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(html);
    } catch (error) {
        response.writeHead(500).end(error.message);
    }
}).listen(4174, '127.0.0.1', () => {
    console.log('Theme regression fixture: http://127.0.0.1:4174');
});
