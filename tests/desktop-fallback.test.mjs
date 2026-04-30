import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, '..');

async function readProjectFile(...segments) {
  return readFile(resolve(projectRoot, ...segments), 'utf8');
}

test('package exposes the Electron desktop fallback and local event bridge commands', async () => {
  const packageJson = JSON.parse(await readProjectFile('package.json'));

  assert.equal(packageJson.scripts.desktop, 'node scripts/start-desktop.mjs');
  assert.equal(packageJson.scripts.event, 'node scripts/goblin-event.mjs');
  assert.equal(packageJson.devDependencies.electron, '41.3.0');
});

test('desktop launcher starts Electron instead of the older Edge app overlay', async () => {
  const launcher = await readProjectFile('scripts', 'start-desktop.mjs');

  assert.match(launcher, /node_modules", "\.bin"/, 'launcher should prefer local Electron');
  assert.match(launcher, /src", "desktop", "main\.cjs"/, 'launcher should boot the desktop main process');
  assert.doesNotMatch(launcher, /msedge/i, 'desktop fallback should not be an Edge app window');
});

test('desktop main window is transparent, frameless, and always on top', async () => {
  const main = await readProjectFile('src', 'desktop', 'main.cjs');

  assert.match(main, /new BrowserWindow/, 'desktop fallback should use BrowserWindow');
  assert.match(main, /transparent:\s*true/, 'desktop fallback should have a transparent window');
  assert.match(main, /frame:\s*false/, 'desktop fallback should be frameless');
  assert.match(main, /alwaysOnTop:\s*true/, 'desktop fallback should start pinned above Codex');
  assert.match(main, /setAlwaysOnTop\(true,\s*"screen-saver"\)/, 'desktop fallback should reinforce topmost behavior');
  assert.match(main, /requestSingleInstanceLock/, 'desktop fallback should avoid launching duplicate companion windows');
  assert.match(main, /showInactive\(\)/, 'desktop fallback should not steal keyboard focus from Codex');
  assert.match(main, /setIgnoreMouseEvents\(true,\s*\{\s*forward:\s*true\s*\}\)/, 'desktop fallback should default to click-through');
  assert.match(main, /setIgnoreMouseEvents\(!isInteractive,\s*\{\s*forward:\s*true\s*\}\)/, 'desktop fallback should only capture clicks over interactive regions');
  assert.match(main, /skipTaskbar:\s*true/, 'desktop fallback should behave like a companion, not a normal app pane');
  assert.match(main, /powerMonitor\.getSystemIdleTime/, 'desktop fallback should derive sleeping state from system idle time');
  assert.match(main, /createServer/, 'desktop fallback should expose a local event bridge');
  assert.match(main, /MAX_EVENT_BODY_BYTES/, 'event bridge should bound request body size');
  assert.match(main, /MAX_EVENT_COMMENT_LENGTH/, 'event bridge should bound comment length');
  assert.match(main, /process\.env\.GOBLIN_WORKSPACE \|\| null/, 'git activity monitoring should require an explicit workspace');
});

test('desktop preload exposes only the narrow companion API', async () => {
  const preload = await readProjectFile('src', 'desktop', 'preload.cjs');

  assert.match(preload, /contextBridge\.exposeInMainWorld\("goblinDesktop"/);
  assert.match(preload, /onSignals/);
  assert.match(preload, /sendWindowCommand/);
  assert.match(preload, /setInteractiveMode/);
  assert.doesNotMatch(preload, /nodeIntegration:\s*true/);
});

test('overlay renderer supports desktop mode without showing debug state controls by default', async () => {
  const [html, css, app] = await Promise.all([
    readProjectFile('src', 'overlay', 'index.html'),
    readProjectFile('src', 'overlay', 'styles.css'),
    readProjectFile('src', 'overlay', 'app.js'),
  ]);

  assert.match(html, /data-desktop-window-bar/, 'overlay should have a desktop window bar');
  assert.match(html, /data-desktop-interactive/, 'overlay should mark the regions allowed to capture clicks');
  assert.match(html, /data-debug-controls/, 'manual state buttons should be marked as debug controls');
  assert.match(css, /\.desktop-mode \[data-debug-controls\]\s*\{[\s\S]*display:\s*none/, 'desktop mode should hide debug controls');
  assert.match(css, /\.desktop-mode\.is-debug \[data-debug-controls\]/, 'debug controls should be opt-in');
  assert.match(app, /window\.goblinDesktop/, 'overlay should bind to the desktop preload API');
  assert.match(app, /applySignals/, 'overlay should react to automatic desktop signals');
  assert.match(app, /resolveAssetUrl/, 'overlay should load assets from http and file URLs');
  assert.match(app, /elementFromPoint/, 'overlay should enable mouse capture only when hovering interactive regions');
});
