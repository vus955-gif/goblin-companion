import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('package exposes the release check command', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

  assert.equal(packageJson.scripts['release:check'], 'node scripts/release-check.mjs && npm test');
});

test('release check passes against the public-facing project files', () => {
  const output = execFileSync(process.execPath, ['scripts/release-check.mjs'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  assert.match(output, /Release check passed/u);
});
