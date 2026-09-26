// Builds the hosted-page version (dist-artifact/): runs the artifact Vite build, then writes page.html,
// the page body the host wraps in its own document skeleton (title, inlined styles, import map, app root).
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
await build({ configFile: path.join(root, 'vite.artifact.config.ts'), logLevel: 'warn' });
const { CDN } = await import(path.join(root, 'vite.artifact.config.ts')).catch(() => ({ CDN: null }));
const out = path.join(root, 'dist-artifact');
const cdn = CDN ?? JSON.parse(fs.readFileSync(path.join(out, 'cdn.json'), 'utf8'));
const assets = fs.readdirSync(path.join(out, 'assets'));
const css = assets.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8')).join('\n');
const page = `<title>100 Years of St Albans Racing</title>
<meta name="description" content="A fictional century of motor racing on the real streets of St Albans. Watch, follow and explore; you never drive.">
<style>
html { box-sizing: border-box; }
${css}
</style>
<script type="importmap">${JSON.stringify({ imports: cdn }, null, 1)}</script>
<div id="app"></div>
<noscript>This game needs JavaScript and WebGL.</noscript>
<script type="module" src="./assets/app.js"></script>
`;
fs.writeFileSync(path.join(out, 'page.html'), page);
fs.rmSync(path.join(out, 'index.html'), { force: true });
for (const f of assets.filter((f) => f.endsWith('.css'))) fs.rmSync(path.join(out, 'assets', f));
const list = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else list.push([path.relative(out, p), fs.statSync(p).size]); } };
walk(out);
for (const [f, s] of list) console.log(`${(s / 1024).toFixed(0).padStart(7)} kB  ${f}`);
