import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, '..');
const buildScriptPath = resolve(projectRoot, 'scripts', 'build-goblin-asset.mjs');
const sourceAssetPath = resolve(projectRoot, 'assets', 'goblin-source', 'goblin_editable_vector.svg');
const generatedAssetPath = resolve(projectRoot, 'assets', 'goblin.svg');
const pluginPreviewPath = resolve(projectRoot, 'assets', 'preview.png');
const pluginManifestPath = resolve(projectRoot, '.codex-plugin', 'plugin.json');
const pluginSkillPath = resolve(projectRoot, 'skills', 'goblin-companion', 'SKILL.md');

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n');
}

function hashSource(sourceSvg) {
  return createHash('sha256').update(normalizeLineEndings(sourceSvg)).digest('hex').slice(0, 16);
}

test('generated goblin runtime asset contains only the cleaned character SVG contract', async () => {
  const sourceSvg = await readFile(sourceAssetPath, 'utf8');
  let svg;

  try {
    svg = await readFile(generatedAssetPath, 'utf8');
  } catch (error) {
    assert.fail(`Expected generated asset at ${generatedAssetPath}: ${error.message}`);
  }

  assert.match(svg, /<svg\b/, 'runtime asset should be an SVG document');
  assert.match(svg, new RegExp(`source-sha256:${hashSource(sourceSvg)}`), 'runtime asset should track its source hash');
  assert.match(svg, /shape-rendering="crispEdges"/, 'runtime asset should keep pixel-art crisp edges');
  assert.match(svg, /id="goblin-character"/, 'runtime asset should expose the main goblin character group');
  assert.match(svg, /fill="url\(#skinGrad\)"/, 'runtime asset should reuse the source skin gradient');
  assert.match(svg, /d="M671 837 H847 V891 H915 V953/, 'runtime asset should reuse the approved source body path');

  assert.doesNotMatch(svg, /bgGrad/, 'runtime asset should not include the preview background gradient');
  assert.doesNotMatch(svg, /platformGrad/, 'runtime asset should not include the preview platform gradient');
  assert.doesNotMatch(svg, /<filter\b/, 'runtime asset should not include expensive SVG filters');

  assert.match(svg, /class="goblin-hat"/, 'runtime asset should name the hat for later animation');
  assert.match(svg, /class="goblin-eye"/, 'runtime asset should name the black eye for later animation');
  assert.match(svg, /class="goblin-right-arm"/, 'runtime asset should expose the existing arm for real SVG animation');
  assert.match(svg, /<g class="goblin-arms">[\s\S]*class="goblin-left-leg[\s\S]*class="goblin-right-arm"/, 'runtime asset should layer the existing arm shapes together for visible happy lifting');
  assert.doesNotMatch(svg, /goblin-cheer/, 'runtime asset should not add separate cheer arms');
  assert.match(svg, /class="goblin-satchel"/, 'runtime asset should name the brown satchel detail');
  assert.match(svg, /class="goblin-nose"/, 'runtime asset should name the long side-profile nose');
});

test('asset build output does not depend on checkout line endings', async () => {
  // Kopia projektu ze zrodlem SVG zapisanym z CRLF (tak jak przy checkoucie z core.autocrlf=true).
  const workDir = await mkdtemp(join(tmpdir(), 'goblin-asset-crlf-'));

  try {
    const crlfSource = normalizeLineEndings(await readFile(sourceAssetPath, 'utf8')).replace(/\n/g, '\r\n');
    const workSourcePath = join(workDir, relative(projectRoot, sourceAssetPath));
    const workScriptPath = join(workDir, relative(projectRoot, buildScriptPath));
    const workPreviewPath = join(workDir, relative(projectRoot, pluginPreviewPath));

    await mkdir(dirname(workSourcePath), { recursive: true });
    await mkdir(dirname(workScriptPath), { recursive: true });
    await mkdir(dirname(workPreviewPath), { recursive: true });
    await writeFile(workSourcePath, crlfSource, 'utf8');
    await copyFile(buildScriptPath, workScriptPath);
    await copyFile(pluginPreviewPath, workPreviewPath);

    await execFileAsync(process.execPath, [workScriptPath], { cwd: workDir, windowsHide: true });

    const builtFromCrlf = await readFile(join(workDir, relative(projectRoot, generatedAssetPath)), 'utf8');
    const committedAsset = normalizeLineEndings(await readFile(generatedAssetPath, 'utf8'));

    assert.equal(builtFromCrlf, committedAsset, 'CRLF source should build the same runtime SVG as the LF source');
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
});

test('plugin manifest paths resolve from the plugin root', async () => {
  // Specyfikacja plugin.json: sciezki sa wzgledne do katalogu glownego pluginu
  // (rodzica .codex-plugin/), a nie do katalogu z samym manifestem.
  const pluginManifest = JSON.parse(await readFile(pluginManifestPath, 'utf8'));
  const { composerIcon, logo, screenshots } = pluginManifest.interface;
  const manifestPaths = [pluginManifest.skills, composerIcon, logo, ...screenshots];

  for (const manifestPath of manifestPaths) {
    assert.match(manifestPath, /^\.\//, `${manifestPath} should be relative and start with ./`);
    await access(resolve(projectRoot, manifestPath)).catch(() => {
      assert.fail(`${manifestPath} from plugin.json does not exist under the plugin root`);
    });
  }

  for (const screenshot of screenshots) {
    assert.match(screenshot, /^\.\/assets\/[^/]+\.png$/, 'screenshots should be PNG files stored under ./assets/');
  }

  assert.equal(resolve(projectRoot, composerIcon), generatedAssetPath, 'composer icon should be the generated runtime SVG');
  assert.equal(resolve(projectRoot, screenshots[0]), pluginPreviewPath, 'preview screenshot should live in ./assets/');
});

test('plugin bundle has the manifest assets it references', async () => {
  const pluginManifest = JSON.parse(await readFile(pluginManifestPath, 'utf8'));

  await access(pluginPreviewPath);
  await access(pluginSkillPath);
  assert.equal(pluginManifest.skills, './skills/', 'plugin should expose the avatar installer skill');
  assert.ok(
    pluginManifest.interface?.defaultPrompt?.some((prompt) => /native Codex avatar/i.test(prompt)),
    'plugin starter prompts should point users to the native Codex avatar'
  );
});
