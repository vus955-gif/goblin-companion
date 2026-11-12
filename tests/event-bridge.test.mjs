import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const { createEventBridgeHandler } = require('../src/desktop/event-bridge.cjs');

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, '..');
const VALID_STATES = new Set(['idle', 'happy', 'sad', 'sick', 'sleeping', 'typing', 'alert', 'feed']);

async function startBridge(t) {
  const events = [];
  let port = 0;
  const server = createServer((request, response) =>
    createEventBridgeHandler({
      onEvent: (event) => events.push(event),
      port,
      validStates: VALID_STATES,
    })(request, response),
  );

  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  port = server.address().port;
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));

  return { events, port };
}

// http.request zamiast fetch, zeby kontrolowac dokladnie wysylane naglowki (Origin, Content-Type).
function send(port, { body = '', headers = {}, method = 'POST', path = '/event' } = {}) {
  return new Promise((resolveResponse, reject) => {
    const outgoing = httpRequest(
      { headers: { 'content-length': Buffer.byteLength(body), ...headers }, host: '127.0.0.1', method, path, port },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolveResponse({ body: text ? JSON.parse(text) : null, status: response.statusCode });
        });
      },
    );
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

const jsonEvent = JSON.stringify({ comment: '  Tests   are green.  ', state: 'happy' });

test('event bridge accepts JSON events from local clients without an Origin header', async (t) => {
  const { events, port } = await startBridge(t);

  const response = await send(port, { body: jsonEvent, headers: { 'content-type': 'application/json' } });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, state: 'happy' });
  assert.deepEqual(events, [{ comment: 'Tests are green.', state: 'happy' }]);
});

test('npm run event CLI still reaches the event bridge', async (t) => {
  const { events, port } = await startBridge(t);

  const { stdout } = await execFileAsync(
    process.execPath,
    ['scripts/goblin-event.mjs', 'sick', 'The test suite just coughed up a stack trace.'],
    {
      cwd: projectRoot,
      env: { ...process.env, GOBLIN_EVENT_PORT: String(port), GOBLIN_EVENT_URL: '' },
      windowsHide: true,
    },
  );

  assert.match(stdout, /Goblin Companion event sent: sick/);
  assert.deepEqual(events, [{ comment: 'The test suite just coughed up a stack trace.', state: 'sick' }]);
});

test('event bridge rejects browser requests that carry an Origin header', async (t) => {
  const { events, port } = await startBridge(t);

  // Przegladarki dolaczaja Origin do kazdego POST (takze same-origin po DNS rebinding);
  // lokalne klienty CLI i hooki go nie wysylaja.
  for (const origin of ['https://evil.example', 'null', `http://127.0.0.1:${port}`]) {
    const response = await send(port, {
      body: jsonEvent,
      headers: { 'content-type': 'application/json', origin },
    });

    assert.equal(response.status, 403, `Origin ${origin} should be rejected`);
    assert.equal(response.body.ok, false);
  }

  const health = await send(port, { headers: { origin: 'https://evil.example' }, method: 'GET', path: '/health' });
  assert.equal(health.status, 403, 'health check should not be readable by web pages either');
  assert.deepEqual(events, []);
});

test('event bridge requires a JSON content type', async (t) => {
  const { events, port } = await startBridge(t);

  // To sa typy, ktore strona WWW moze wyslac formularzem lub fetch bez preflightu CORS.
  for (const contentType of [
    'text/plain',
    'text/plain;charset=UTF-8',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=goblin',
    'application/jsonp',
    undefined,
  ]) {
    const headers = contentType ? { 'content-type': contentType } : {};
    const response = await send(port, { body: jsonEvent, headers });

    assert.equal(response.status, 415, `${contentType ?? 'missing content type'} should be rejected`);
    assert.match(response.body.error, /application\/json/);
  }

  assert.deepEqual(events, []);
});

test('event bridge accepts JSON content type parameters and casing', async (t) => {
  const { events, port } = await startBridge(t);

  const response = await send(port, {
    body: JSON.stringify({ state: 'feed' }),
    headers: { 'content-type': 'Application/JSON; charset=UTF-8' },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, [{ comment: undefined, state: 'feed' }]);
});

test('event bridge still validates state names', async (t) => {
  const { events, port } = await startBridge(t);

  const response = await send(port, {
    body: JSON.stringify({ state: 'dancing' }),
    headers: { 'content-type': 'application/json' },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /Unknown state: dancing/);

  for (const body of ['null', '[]', '"happy"']) {
    const nonObject = await send(port, { body, headers: { 'content-type': 'application/json' } });
    assert.equal(nonObject.status, 400, `${body} should be rejected`);
    assert.match(nonObject.body.error, /JSON object/);
  }

  assert.deepEqual(events, []);
});
