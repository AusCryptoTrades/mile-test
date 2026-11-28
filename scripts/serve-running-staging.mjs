import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const production = 'https://mgixvokjlytjuypzcfzz.supabase.co';
const staging = 'https://fnyfeelynaozxtftrrga.supabase.co';
const port = Number(process.env.MILE_STAGING_PORT || 4186);
const key = process.env.MILE_STAGING_PUBLISHABLE_KEY || '';
const root = new URL('../', import.meta.url);
const output = process.argv[2]==='--output' && process.argv.length===4 ? resolve(process.argv[3]) : null;
if (process.argv.length > 2 && !output) throw new Error('Use --output DIRECTORY to create a portable staging preview.');

if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
  throw new Error('Set MILE_STAGING_PUBLISHABLE_KEY to the MILE Staging publishable key.');
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Choose a staging port between 1024 and 65535.');
}

const origin = 'http://127.0.0.1:' + port;
const build = process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(build)) throw new Error('Expected a Git commit SHA for the beta build.');
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
    .replaceAll('https://app.milefitness.com.au', output ? '' : origin);
  if (output && entry.name === 'mile-reset-password.html') {
    content = content.replace("REDIRECT='/mile-reset-password.html'", "REDIRECT=new URL('/mile-reset-password.html', location.origin).href");
  }
  if (entry.name === 'index.html') {
    content = content.replace('<html', '<html data-mile-staging="true"')
      .replace('</head>', '<meta name="mile-beta-build" content="'+build+'"><script src="./mile-running-beta.js" defer></script></head>');
  }
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

if (output) {
 await mkdir(output, { recursive: false });
 for (const [path, asset] of assets) if (path !== '/') await writeFile(resolve(output,path.slice(1)),asset,{flag:'wx'});
 await writeFile(resolve(output,'_headers'),'/*\n'+Object.entries(securityHeaders).map(([name,value])=>'  '+name+': '+value).join('\n')+'\n',{flag:'wx'});
 console.log('Created staging-only preview in '+output);
} else createServer((req, res) => {
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
