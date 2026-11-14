import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:3191';
await mkdir('.data/production-smoke', { recursive: true });
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '3191',
    PUBLIC_ORIGIN: '',
    RENDER_EXTERNAL_URL: origin + '/',
    DATA_DIR: '.data/production-smoke',
    TAVILY_API_KEY: '',
    keyayham: '',
  },
  stdio: 'ignore',
  windowsHide: true,
});
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(origin + '/api/health');
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(ready, 'Production server did not become ready');
  const html = await fetch(origin + '/');
  assert.equal(html.status, 200);
  const document = await html.text();
  assert(document.includes('<div id="root"></div>'));
  assert(!document.includes('/client/main.tsx'), 'Production HTML must use built assets');
  const assets = [...document.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map(
    (match) => match[1],
  );
  assert(
    assets.some((asset) => asset.endsWith('.js')),
    'Built JavaScript missing',
  );
  assert(
    assets.some((asset) => asset.endsWith('.css')),
    'Built CSS missing',
  );
  for (const asset of assets) {
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200, `Built asset failed: ${asset}`);
    assert((await response.arrayBuffer()).byteLength > 0);
  }
  const logo = await fetch(origin + '/rasd-mark.svg');
  assert.equal(logo.status, 200);
  assert(logo.headers.get('content-type')?.includes('image/svg+xml'));
  assert((await logo.text()).includes('<svg'));
  assert(html.headers.get('content-security-policy')?.includes("default-src 'self'"));
  const health = await fetch(origin + '/api/health');
  const cookie = health.headers.get('set-cookie')?.split(';')[0];
  assert(cookie);
  assert(health.headers.get('set-cookie')?.includes('Secure'));
  const session = await fetch(origin + '/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, Origin: origin },
    body: JSON.stringify({ domain: 'employees' }),
  });
  assert.equal(session.status, 201, 'Render public-origin requests must succeed');
  assert((await session.json()).id);
  const plan = {
    version: 1,
    domain: 'smoke',
    seed: 42,
    tables: [
      {
        name: 'companies',
        count: 2,
        fields: [
          { name: 'id', type: 'integer', nullable: false },
          { name: 'name', type: 'string', nullable: false, semantic: 'company' },
        ],
        primaryKey: ['id'],
        unique: [],
        foreignKeys: [],
      },
    ],
    rules: [],
    assumptions: [],
  };
  const start = await fetch(origin + '/api/jobs/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, Origin: origin },
    body: JSON.stringify(plan),
  });
  assert.equal(start.status, 200);
  const job = (await start.json()) as any;
  let completed = false;
  for (let i = 0; i < 100; i++) {
    const response = await fetch(origin + '/api/jobs/' + job.id, { headers: { cookie } });
    const state = (await response.json()) as any;
    if (state.status === 'complete') {
      completed = true;
      break;
    }
    if (state.status === 'failed') throw Error('Production generation failed');
    await new Promise((r) => setTimeout(r, 50));
  }
  assert(completed);
  const response = await fetch(origin + '/api/jobs/' + job.id + '/download', {
    headers: { cookie },
  });
  assert.equal(response.status, 200);
  const data = (await response.json()) as any;
  assert.equal(data.companies.length, 2);
  console.log(
    JSON.stringify({
      productionStartup: true,
      staticFrontend: true,
      builtAssets: assets.length,
      brandAsset: true,
      securityHeaders: true,
      secureCookie: true,
      renderPublicOrigin: true,
      sessionCreation: true,
      apiGeneration: true,
      downloadVerified: true,
    }),
  );
} finally {
  child.kill('SIGTERM');
}
