import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, '..');
const manifestPath = resolve(projectRoot, 'assets', 'codex-avatar', 'goblin-companion', 'avatar.json');
const metadataPath = resolve(projectRoot, 'assets', 'codex-avatar', 'goblin-companion', 'spritesheet.meta.json');
const spritesheetPath = resolve(projectRoot, 'assets', 'codex-avatar', 'goblin-companion', 'spritesheet.png');
const builderPath = resolve(projectRoot, 'scripts', 'build-codex-avatar.mjs');
const installerPath = resolve(projectRoot, 'scripts', 'install-codex-avatar.mjs');
const execFileAsync = promisify(execFile);

function readPngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  assert.equal(signature, '89504e470d0a1a0a', 'spritesheet should be a PNG file');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test('native Codex avatar manifest points at the generated spritesheet', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));

  assert.equal(manifest.id, 'goblin-companion');
  assert.equal(manifest.displayName, 'Goblin Companion');
  assert.equal(typeof manifest.description, 'string');
  assert.equal(manifest.spritesheetPath, 'spritesheet.png');
  assert.deepEqual(Object.keys(manifest).sort(), ['description', 'displayName', 'id', 'spritesheetPath']);
  assert.equal(metadata.codexSpritesheet.frameWidth, 192);
  assert.equal(metadata.codexSpritesheet.frameHeight, 208);
  assert.equal(metadata.codexSpritesheet.columns, 8);
  assert.equal(metadata.codexSpritesheet.rows, 9);
  assert.equal(metadata.codexSpritesheet.width, 1536);
  assert.equal(metadata.codexSpritesheet.height, 1872);
  assert.deepEqual(metadata.codexSpritesheet.stateRows, {
    idle: 0,
    'running-right': 1,
    'running-left': 2,
    waving: 3,
    jumping: 4,
    failed: 5,
    waiting: 6,
    running: 7,
    review: 8,
  });
});

test('native Codex avatar spritesheet has the exact dimensions Codex validates', async () => {
  const spritesheet = await readFile(spritesheetPath);
  assert.deepEqual(readPngSize(spritesheet), { width: 1536, height: 1872 });
});

test('builder documents every Codex avatar state row used by the desktop app', async () => {
  const source = await readFile(builderPath, 'utf8');

  for (const state of [
    'idle',
    "'running-right'",
    "'running-left'",
    'waving',
    'jumping',
    'failed',
    'waiting',
    'running',
    'review',
  ]) {
    assert.match(source, new RegExp(`${state}: \\d`), `builder should include ${state} row`);
  }
});

test('installer selects the custom avatar through Codex native persisted state keys', async () => {
  const source = await readFile(installerPath, 'utf8');

  assert.match(source, /selected-avatar-id/, 'installer should select the native custom avatar id');
  assert.match(source, /custom:\$\{avatarId\}/, 'installer should use Codex custom:<folder> ids');
  assert.match(source, /electron-avatar-overlay-open/, 'installer should ask Codex to open the native avatar overlay');
  assert.match(source, /goblin-companion-backup/, 'installer should back up Codex global state before editing it');
});

test('installer copies avatar files and patches only the requested temporary CODEX_HOME state', async (t) => {
  const codexHome = await mkdtemp(join(tmpdir(), 'goblin-codex-home-'));
  t.after(() => rm(codexHome, { force: true, recursive: true }));
  const globalStatePath = join(codexHome, '.codex-global-state.json');

  await writeFile(
    globalStatePath,
    `${JSON.stringify({
      'electron-persisted-atom-state': {
        existing: true,
      },
    })}\n`,
    'utf8',
  );

  await execFileAsync(process.execPath, [installerPath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
    },
  });

  const installedManifest = JSON.parse(
    await readFile(join(codexHome, 'avatars', 'goblin-companion', 'avatar.json'), 'utf8'),
  );
  const installedSpritesheet = await readFile(join(codexHome, 'avatars', 'goblin-companion', 'spritesheet.png'));
  const patchedState = JSON.parse(await readFile(globalStatePath, 'utf8'));

  assert.deepEqual(Object.keys(installedManifest).sort(), ['description', 'displayName', 'id', 'spritesheetPath']);
  assert.deepEqual(readPngSize(installedSpritesheet), { width: 1536, height: 1872 });
  assert.equal(patchedState['electron-persisted-atom-state'].existing, true);
  assert.equal(patchedState['electron-persisted-atom-state']['selected-avatar-id'], 'custom:goblin-companion');
  assert.equal(patchedState['electron-avatar-overlay-open'], true);
});

test('installer with --no-state copies avatar files and leaves Codex global state untouched', async (t) => {
  const codexHome = await mkdtemp(join(tmpdir(), 'goblin-codex-home-'));
  t.after(() => rm(codexHome, { force: true, recursive: true }));
  const globalStatePath = join(codexHome, '.codex-global-state.json');
  const originalState = `${JSON.stringify({ 'electron-persisted-atom-state': { existing: true } })}\n`;

  await writeFile(globalStatePath, originalState, 'utf8');

  const { stdout } = await execFileAsync(process.execPath, [installerPath, '--no-state'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
    },
  });

  assert.match(stdout, /--no-state/);
  assert.equal(await readFile(globalStatePath, 'utf8'), originalState, 'global state should stay byte-for-byte identical');
  assert.deepEqual(
    (await readdir(codexHome)).sort(),
    ['.codex-global-state.json', 'avatars'],
    'no backup file should be written when state is skipped',
  );
  await readFile(join(codexHome, 'avatars', 'goblin-companion', 'avatar.json'), 'utf8');
});

test('docs disclose that the installer edits Codex global state and how to skip it', async () => {
  const installer = await readFile(installerPath, 'utf8');
  assert.match(installer, /\.codex-global-state\.json/, 'installer still edits Codex global state');

  for (const docPath of ['README.md', 'docs/architecture.md', 'skills/goblin-companion/SKILL.md']) {
    const doc = await readFile(resolve(projectRoot, docPath), 'utf8');

    assert.match(doc, /\.codex-global-state\.json/, `${docPath} should name the Codex state file the installer edits`);
    assert.match(doc, /--no-state/, `${docPath} should explain how to install without editing Codex state`);
  }
});
