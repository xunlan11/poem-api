#!/usr/bin/env node
const fetch = require('node-fetch');

function parseArgs(argv) {
  const args = { version: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg.startsWith('--version=')) {
      args.version = arg.slice('--version='.length);
    } else if (arg === '--version') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.version = next;
        i += 1;
      }
    }
  }
  return args;
}

async function main() {
  const base = process.env.POEM_DEPLOY_BASE || 'http://scp.anomicon.asia/poem';
  const username = process.env.POEM_DEPLOY_USER || '张恒硕';
  const password = process.env.POEM_DEPLOY_PASS || '1wdvBHU*';
  const { version } = parseArgs(process.argv);

  if (!version) {
    console.error('请指定版本号！');
    process.exit(1);
  }

  console.log(`[broadcast] Using base ${base}`);
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!loginRes.ok) {
    const text = await loginRes.text();
    throw new Error(`Login failed: HTTP ${loginRes.status} ${text}`);
  }

  const cookies = loginRes.headers.raw()['set-cookie'] || [];
  const tokenCookie = cookies.find(c => c.startsWith('poem_token='));
  if (!tokenCookie) throw new Error('poem_token cookie missing');
  const cookieHeader = tokenCookie.split(';')[0];

  const payload = { version };
  const broadcastRes = await fetch(`${base}/api/version/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader
    },
    body: JSON.stringify(payload)
  });

  const data = await broadcastRes.json().catch(() => ({}));
  if (!broadcastRes.ok) {
    throw new Error(`Broadcast failed: HTTP ${broadcastRes.status} ${JSON.stringify(data)}`);
  }

  console.log(`[broadcast] Broadcast success, version=${data.version || payload.version || 'auto'}`);
}

main().catch(err => {
  console.error('[broadcast] ERROR', err.message);
  process.exit(1);
});
