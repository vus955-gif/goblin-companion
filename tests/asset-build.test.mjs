import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, '..');
const sourceAssetPath = resolve(projectRoot, 'assets', 'goblin-source', 'goblin_editable_vector.svg');
const generatedAssetPath = resolve(projectRoot, 'assets', 'goblin.svg');
const pluginIconPath = resolve(projectRoot, '.codex-plugin', 'assets', 'goblin.svg');
const pluginPreviewPath = resolve(projectRoot, '.codex-plugin', 'assets', 'preview.png');
const pluginManifestPath = resolve(projectRoot, '.codex-plugin', 'plugin.json');
const pluginSkillPath = resolve(projectRoot, 'skills', 'goblin-companion', 'SKILL.md');

function hashSource(sourceSvg) {
  return createHash('sha256').update(sourceSvg).digest('hex').slice(0, 16);
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

test('plugin bundle has the manifest assets it references', async () => {
  const runtimeSvg = await readFile(generatedAssetPath, 'utf8');
  const pluginSvg = await readFile(pluginIconPath, 'utf8');
  const pluginManifest = JSON.parse(await readFile(pluginManifestPath, 'utf8'));

  assert.equal(pluginSvg, runtimeSvg, 'plugin goblin icon should match the generated runtime SVG');
  await access(pluginPreviewPath);
  await access(pluginSkillPath);
  assert.equal(pluginManifest.skills, './skills/', 'plugin should expose the avatar installer skill');
  assert.ok(
    pluginManifest.interface?.defaultPrompt?.some((prompt) => /native Codex avatar/i.test(prompt)),
    'plugin starter prompts should point users to the native Codex avatar'
  );
});
