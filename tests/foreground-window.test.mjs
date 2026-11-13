import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const {
  FOREGROUND_WINDOW_SCRIPT,
  RESPONSE_PREFIX,
  createForegroundWindowProbe,
  getPowerShellArgs,
} = require('../src/desktop/foreground-window.cjs');

// Atrapa child_process.spawn: kazde zapytanie "<id>" na stdin dostaje linie z `respond`
// (string = gotowa linia wyjscia, undefined = brak odpowiedzi).
const answer = (id, value) => `${RESPONSE_PREFIX} ${id} ${JSON.stringify(value)}`;

function createFakeSpawn({
  failToStart = false,
  respond = (n, id) => answer(id, { ProcessName: 'Codex', Title: `Codex ${n}` }),
} = {}) {
  const spawned = [];

  function spawnProcess(command, args, options) {
    const child = new EventEmitter();
    child.pid = 4000 + spawned.length;
    child.exitCode = null;
    child.killed = false;
    child.stdinEnded = false;
    child.writes = 0;
    child.stdout = new PassThrough();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        child.writes += 1;
        const reply = respond(child.writes, Number(String(chunk).trim()));

        if (reply !== undefined) {
          setImmediate(() => child.stdout.write(`${reply}\r\n`));
        }

        callback();
      },
      final(callback) {
        child.stdinEnded = true;
        callback();
      },
    });
    child.kill = () => {
      child.killed = true;
      setImmediate(() => {
        child.exitCode = 1;
        child.emit('exit', 1, null);
      });
      return true;
    };

    if (failToStart) {
      setImmediate(() => child.emit('error', Object.assign(new Error('spawn powershell.exe ENOENT'), { code: 'ENOENT' })));
    }

    spawned.push({ args, child, command, options });
    return child;
  }

  return { spawnProcess, spawned };
}

test('foreground probe reuses one long-lived PowerShell process for every sample', async () => {
  const fake = createFakeSpawn();
  const probe = createForegroundWindowProbe({ platform: 'win32', spawnProcess: fake.spawnProcess });

  const results = [];
  for (let index = 0; index < 3; index += 1) {
    results.push(await probe.sample());
  }

  assert.equal(fake.spawned.length, 1, 'PowerShell should start once, not on every poll');
  assert.equal(fake.spawned[0].command, 'powershell.exe');
  assert.equal(fake.spawned[0].options.windowsHide, true);
  assert.deepEqual(results.map((result) => result.Title), ['Codex 1', 'Codex 2', 'Codex 3']);
  assert.equal(results[0].ProcessName, 'Codex');
  probe.dispose();
});

test('foreground helper compiles the C# type once and answers requests from stdin', () => {
  const args = getPowerShellArgs();
  const encoded = args[args.indexOf('-EncodedCommand') + 1];

  assert.ok(!args.includes('-Command'), 'script should be passed encoded, not re-parsed from the command line');
  assert.equal(Buffer.from(encoded, 'base64').toString('utf16le'), FOREGROUND_WINDOW_SCRIPT);
  assert.equal(FOREGROUND_WINDOW_SCRIPT.match(/Add-Type/g).length, 1, 'C# helper should be compiled exactly once');
  assert.match(FOREGROUND_WINDOW_SCRIPT, /while \(\$null -ne \(\$requestId = \$stdin\.ReadLine\(\)\)\)/, 'helper should exit when stdin closes');
  assert.match(FOREGROUND_WINDOW_SCRIPT, /\$ProgressPreference = 'SilentlyContinue'/, 'progress records should not reach the pipes');
});

test('concurrent samples share a single in-flight request', async () => {
  const fake = createFakeSpawn();
  const probe = createForegroundWindowProbe({ platform: 'win32', spawnProcess: fake.spawnProcess });

  const first = probe.sample();
  const second = probe.sample();

  assert.equal(first, second);
  assert.equal((await first).Title, 'Codex 1');
  assert.equal(fake.spawned[0].child.writes, 1);
  probe.dispose();
});

test('a timed-out helper is killed and restarted on the next sample', async () => {
  const fake = createFakeSpawn({ respond: () => undefined });
  const failures = [];
  const probe = createForegroundWindowProbe({
    onFailure: (reason) => failures.push(reason),
    platform: 'win32',
    retryDelayMs: 0,
    sampleTimeoutMs: 30,
    spawnProcess: fake.spawnProcess,
    startupTimeoutMs: 30,
  });

  assert.equal(await probe.sample(), null, 'timeout should resolve to null instead of hanging');
  assert.equal(fake.spawned[0].child.killed, true, 'stuck helper should be killed');

  assert.match(failures[0], /no answer within 30 ms/);

  await probe.sample();
  assert.equal(fake.spawned.length, 2, 'next sample should start a fresh helper');
  probe.dispose();
});

test('malformed helper output resolves to null without breaking later samples', async () => {
  const fake = createFakeSpawn({
    respond: (n, id) => (n === 1 ? `${RESPONSE_PREFIX} ${id} not json` : answer(id, { ProcessName: 'Code', Title: 'ok' })),
  });
  const probe = createForegroundWindowProbe({ platform: 'win32', spawnProcess: fake.spawnProcess });

  assert.equal(await probe.sample(), null);
  assert.deepEqual(await probe.sample(), { ProcessName: 'Code', Title: 'ok' });
  assert.equal(fake.spawned.length, 1);
  probe.dispose();
});

test('unrelated output and stale answers are not matched to the current request', async () => {
  const fake = createFakeSpawn({
    respond: (n, id) => [
      '#< CLIXML',
      answer(id - 1, { ProcessName: 'stale', Title: 'previous request' }),
      answer(id, { ProcessName: 'Codex', Title: `current ${n}` }),
    ].join('\r\n'),
  });
  const probe = createForegroundWindowProbe({ platform: 'win32', spawnProcess: fake.spawnProcess });

  assert.deepEqual(await probe.sample(), { ProcessName: 'Codex', Title: 'current 1' });
  assert.deepEqual(await probe.sample(), { ProcessName: 'Codex', Title: 'current 2' });
  probe.dispose();
});

test('probe backs off with growing delays after start failures and reports why', async () => {
  const fake = createFakeSpawn({ failToStart: true });
  const failures = [];
  let clock = 0;
  const probe = createForegroundWindowProbe({
    now: () => clock,
    onFailure: (reason, count) => failures.push({ count, reason }),
    platform: 'win32',
    retryDelayMs: 1000,
    spawnProcess: fake.spawnProcess,
  });

  assert.equal(await probe.sample(), null);
  assert.equal(fake.spawned.length, 1);
  assert.match(failures[0].reason, /could not start powershell\.exe: .*ENOENT/);

  clock = 999;
  assert.equal(await probe.sample(), null);
  assert.equal(fake.spawned.length, 1, 'no respawn during the first 1 s backoff');

  clock = 1000;
  await probe.sample();
  assert.equal(fake.spawned.length, 2, 'retry after the first backoff');

  clock = 2999;
  await probe.sample();
  assert.equal(fake.spawned.length, 2, 'second backoff doubles to 2 s');

  clock = 3000;
  await probe.sample();
  assert.equal(fake.spawned.length, 3);
  assert.deepEqual(failures.map(({ count }) => count), [1, 2, 3]);
});

test('a successful answer resets the failure backoff', async () => {
  let failNext = true;
  const fake = createFakeSpawn({ respond: (n, id) => answer(id, { ProcessName: 'Codex', Title: `ok ${n}` }) });
  const spawnProcess = (...args) => {
    const child = fake.spawnProcess(...args);

    if (failNext) {
      failNext = false;
      setImmediate(() => {
        child.exitCode = 3221225794;
        child.emit('exit', 3221225794, null);
      });
    }

    return child;
  };
  let clock = 0;
  const failures = [];
  const probe = createForegroundWindowProbe({
    now: () => clock,
    onFailure: (reason) => failures.push(reason),
    platform: 'win32',
    retryDelayMs: 1000,
    spawnProcess,
    startupTimeoutMs: 1000,
  });

  assert.equal(await probe.sample(), null);
  assert.match(failures[0], /exited \(code 3221225794/);

  clock = 1000;
  assert.equal((await probe.sample()).Title, 'ok 1');
  assert.equal((await probe.sample()).Title, 'ok 2', 'healthy helper should be sampled without delay');
  probe.dispose();
});

test('dispose ends stdin, kills the helper, and resolves the pending sample', async () => {
  const fake = createFakeSpawn({ respond: () => undefined });
  const probe = createForegroundWindowProbe({ platform: 'win32', spawnProcess: fake.spawnProcess });

  const pendingSample = probe.sample();
  probe.dispose();

  assert.equal(await pendingSample, null);
  assert.equal(fake.spawned[0].child.killed, true);
  await delay(5);
  assert.equal(fake.spawned[0].child.stdinEnded, true);
  assert.equal(await probe.sample(), null);
  assert.equal(fake.spawned.length, 1, 'disposed probe should not start a new helper');
});

test('non-Windows platforms never spawn PowerShell', async () => {
  const fake = createFakeSpawn();
  const probe = createForegroundWindowProbe({ platform: 'linux', spawnProcess: fake.spawnProcess });

  assert.equal(await probe.sample(), null);
  assert.equal(fake.spawned.length, 0);
});

test('real PowerShell helper answers repeated samples from one process and exits on dispose', { skip: process.platform !== 'win32' }, async (t) => {
  const failures = [];
  const probe = createForegroundWindowProbe({ onFailure: (reason) => failures.push(reason), retryDelayMs: 0 });
  t.after(() => probe.dispose());

  // Pod duzym obciazeniem start procesu konsoli potrafi sie nie udac; sonda wtedy
  // probuje ponownie, wiec test tez daje jej kilka prob i raportuje przyczyne.
  const startedAt = performance.now();
  let first = null;
  for (let attempt = 0; attempt < 3 && !first; attempt += 1) {
    first = await probe.sample();
  }
  const firstMs = performance.now() - startedAt;

  if (failures.length > 0) {
    t.diagnostic(`helper start failures before success: ${failures.join(' | ')}`);
  }
  const pid = probe.pid;

  assert.ok(first, `helper should answer within 3 attempts; failures: ${failures.join(' | ')}`);
  assert.equal(typeof first.ProcessName, 'string');
  assert.equal(typeof first.Title, 'string');

  const warmStartedAt = performance.now();
  const second = await probe.sample();
  const warmMs = performance.now() - warmStartedAt;

  assert.ok(second, 'helper should answer the second sample');
  assert.equal(probe.pid, pid, 'second sample should reuse the same PowerShell process');
  t.diagnostic(`first sample (start + compile): ${firstMs.toFixed(0)} ms, warm sample: ${warmMs.toFixed(1)} ms`);

  probe.dispose();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }

    await delay(50);
  }

  assert.fail(`PowerShell helper ${pid} is still running after dispose`);
});
