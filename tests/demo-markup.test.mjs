import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, '..');
const demoHtmlPath = resolve(projectRoot, 'src', 'demo', 'index.html');
const demoCssPath = resolve(projectRoot, 'src', 'demo', 'styles.css');
const overlayHtmlPath = resolve(projectRoot, 'src', 'overlay', 'index.html');
const overlayCssPath = resolve(projectRoot, 'src', 'overlay', 'styles.css');

test('happy animation does not add fake overlay arms outside the SVG rig', async () => {
  const [html, css] = await Promise.all([
    readFile(demoHtmlPath, 'utf8'),
    readFile(demoCssPath, 'utf8'),
  ]);

  assert.doesNotMatch(html, /happy-arm/, 'demo markup should not include separate happy arm spans');
  assert.doesNotMatch(css, /\.happy-arm/, 'demo CSS should animate SVG arm classes instead of overlay arms');
  assert.doesNotMatch(css, /goblin-cheer/, 'demo CSS should not animate extra cheer arms');
  assert.match(css, /\.goblin-widget\.is-happy \.goblin-right-arm/, 'happy state should animate the existing SVG arm');
  assert.match(css, /\.goblin-widget\.is-happy \.goblin-left-leg/, 'happy state should lift the existing left-side limb instead of drawing a fake arm');
  assert.match(css, /leftArmHappyLift/, 'happy state should have a dedicated lift animation for the existing left-side limb');
  assert.match(css, /translateY\(-2[4-9][0-9]px\)/, 'happy hop should be scaled for the SVG viewBox and visibly stronger than the idle walk');
  assert.match(css, /paint-order:\s*stroke fill/, 'lifted happy arms should keep a pixel-outline instead of becoming loose green shapes');
});

test('sick effect uses an animated SVG puke sprite instead of a static CSS bar', async () => {
  const [html, css] = await Promise.all([
    readFile(demoHtmlPath, 'utf8'),
    readFile(demoCssPath, 'utf8'),
  ]);

  assert.match(html, /<svg class="puke-sprite"/, 'sick effect should be an SVG sprite');
  assert.doesNotMatch(html, /<span class="puke"/, 'sick effect should not be a plain span overlay');
  assert.doesNotMatch(css, /\.goblin-widget\.is-sick \.puke\s*\{/, 'sick effect should not be a static CSS puke bar');
  assert.match(css, /pukeFrameA/, 'sick sprite should have at least two animated frames');
  assert.match(css, /pukeFrameB/, 'sick sprite should switch to the second animated frame');
  assert.match(css, /pukeDropLow/, 'sick sprite should animate the lower droplet');
});

test('feed effect moves a token prop from hands to mouth and shows chewing marks', async () => {
  const [html, css] = await Promise.all([
    readFile(demoHtmlPath, 'utf8'),
    readFile(demoCssPath, 'utf8'),
  ]);

  assert.match(html, /<svg class="feed-token-prop"/, 'feed effect should use an SVG token prop');
  assert.match(html, /class="chew-marks"/, 'feed effect should include chewing marks near the mouth');
  assert.doesNotMatch(html, /<span class="token-burst"/, 'feed effect should not use the old floating +1 badge');
  assert.match(css, /feedTokenToMouth/, 'token should animate from the hands toward the mouth');
  assert.match(css, /feedTokenBite/, 'token should show a bite during the chewing phase');
  assert.match(css, /chewMarksAppear/, 'chewing marks should appear after the token reaches the mouth');
  assert.match(css, /rightArmSnack/, 'the existing SVG arm should move with the feeding action');
});

test('overlay surface exposes the real companion controls for Codex sessions', async () => {
  const [html, css] = await Promise.all([
    readFile(overlayHtmlPath, 'utf8'),
    readFile(overlayCssPath, 'utf8'),
  ]);

  assert.match(html, /Goblin Companion Overlay/, 'overlay should have a dedicated window title');
  assert.match(html, /data-state-button="happy"/, 'overlay should expose happy state control');
  assert.match(html, /data-state-button="typing"/, 'overlay should expose typing state control');
  assert.match(html, /data-feed-button/, 'overlay should allow token feeding');
  assert.match(html, /<svg class="feed-token-prop"/, 'overlay should use the same token prop animation');
  assert.doesNotMatch(html, /<span class="token-burst"/, 'overlay should not use the old floating +1 badge');
  assert.match(css, /overlay-widget/, 'overlay CSS should convert the fixed demo widget into a compact window surface');
});
