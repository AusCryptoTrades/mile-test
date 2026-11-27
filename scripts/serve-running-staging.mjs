import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';

const production = 'https://mgixvokjlytjuypzcfzz.supabase.co';
const staging = 'https://fnyfeelynaozxtftrrga.supabase.co';
const port = Number(process.env.MILE_STAGING_PORT || 4186);
const key = process.env.MILE_STAGING_PUBLISHABLE_KEY || '';
const root = new URL('../', import.meta.url);

if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
  throw new Error('Set MILE_STAGING_PUBLISHABLE_KEY to the MILE Staging publishable key.');
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Choose a staging port between 1024 and 65535.');
}

const origin = 'http://127.0.0.1:' + port;
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
const index = await readFile(new URL('index.html', root), 'utf8');
const productionKey = index.match(/supabaseAnon:'(sb_publishable_[A-Za-z0-9_-]+)'/)?.[1];
if (!productionKey || key === productionKey) {
  throw new Error('Use the publishable key from MILE Staging.');
}

const assets = new Map();
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isFile() || !/^(index\.html|mile-[a-z0-9.-]+\.(html|js|css))$/.test(entry.name)) continue;
  let content = (await readFile(new URL(entry.name, root), 'utf8'))
    .replaceAll(production, staging)
    .replaceAll(productionKey, key)
    .replaceAll('https://app.milefitness.com.au', origin);
  if (entry.name === 'index.html') content = content.replace('<html', '<html data-mile-staging="true"');
  assets.set('/' + entry.name, content);
}
assets.set('/', assets.get('/index.html'));

const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: " + staging,
    "connect-src " + staging, "form-action 'self'", "frame-src 'self'",
    "base-uri 'none'", "frame-ancestors 'self'"
  ].join('; ')
};

createServer((req, res) => {
  const pathname = (req.url || '').split('?')[0];
  const asset = assets.get(pathname);
  if (req.headers.host !== '127.0.0.1:' + port || !asset || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404, securityHeaders).end();
    return;
  }
  const type = types[pathname === '/' ? 'html' : pathname.split('.').at(-1)];
  res.writeHead(200, { ...securityHeaders, 'Content-Type': type + '; charset=utf-8' });
  res.end(req.method === 'HEAD' ? undefined : asset);
}).listen(port, '127.0.0.1', () => {
  console.log('MILE Staging listening at ' + origin);
});
