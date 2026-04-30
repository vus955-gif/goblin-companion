import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, '..');

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForServer(url, processHandle) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Demo server exited early with code ${processHandle.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Serwer moze jeszcze startowac, wiec czekamy krotko i probujemy ponownie.
    }

    await delay(60);
  }

  throw new Error(`Demo server did not respond at ${url}.`);
}

test('demo server serves only the public demo surface', async (t) => {
  const port = await getFreePort();
  const server = spawn(process.execPath, ['scripts/serve-demo.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(() => {
    if (server.exitCode === null) {
      server.kill();
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/src/demo/`, server);

  const demo = await fetch(`${baseUrl}/src/demo/`);
  assert.equal(demo.status, 200);
  assert.match(await demo.text(), /Goblin Companion Demo/);

  const overlay = await fetch(`${baseUrl}/src/overlay/`);
  assert.equal(overlay.status, 200);
  assert.match(await overlay.text(), /Goblin Companion Overlay/);

  const overlayStyles = await fetch(`${baseUrl}/src/overlay/styles.css`);
  assert.equal(overlayStyles.status, 200);
  assert.match(overlayStyles.headers.get('content-type') ?? '', /text\/css/);

  const overlayApp = await fetch(`${baseUrl}/src/overlay/app.js`);
  assert.equal(overlayApp.status, 200);
  assert.match(overlayApp.headers.get('content-type') ?? '', /text\/javascript/);

  const asset = await fetch(`${baseUrl}/assets/goblin.svg`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type') ?? '', /image\/svg\+xml/);

  const moduleFile = await fetch(`${baseUrl}/src/companion/comments.js`);
  assert.equal(moduleFile.status, 200);

  const favicon = await fetch(`${baseUrl}/favicon.ico`);
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get('content-type') ?? '', /image\/svg\+xml/);

  const gitConfig = await fetch(`${baseUrl}/.git/config`);
  assert.equal(gitConfig.status, 404);

  const packageJson = await fetch(`${baseUrl}/package.json`);
  assert.equal(packageJson.status, 404);
});
