import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const canonicalSourcePath = resolve(projectRoot, 'assets', 'goblin-source', 'goblin_editable_vector.svg');
const outputPath = resolve(projectRoot, 'assets', 'goblin.svg');
const pluginAssetDir = resolve(projectRoot, '.codex-plugin', 'assets');
const pluginIconPath = resolve(pluginAssetDir, 'goblin.svg');
const pluginPreviewPath = resolve(pluginAssetDir, 'preview.png');

// Walidujemy kilka stabilnych znacznikow, zeby przypadkiem nie zbudowac runtime assetu
// z ciezkiej mozaiki albo innego pliku niz zatwierdzony editable vector.
function assertApprovedSource(sourceSvg) {
  const sourceSize = Buffer.byteLength(sourceSvg, 'utf8');
  const requiredMarkers = [
    'id="goblinSilhouette"',
    'id="hatGrad"',
    'id="skinGrad"',
    'id="shortsGrad"',
    'filter id="softSilhouette"',
    'filter id="platformBlur"',
  ];

  if (sourceSize > 100_000) {
    throw new Error(
      `Source SVG is ${sourceSize} bytes, which is too large for the approved editable vector source.`
    );
  }

  const missingMarkers = requiredMarkers.filter((marker) => !sourceSvg.includes(marker));
  if (missingMarkers.length > 0) {
    throw new Error(`Source SVG does not match the approved editable vector. Missing: ${missingMarkers.join(', ')}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractElementById(sourceSvg, tagName, id) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*\\bid="${escapeRegExp(id)}"[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'm');
  const match = sourceSvg.match(pattern);

  if (!match) {
    throw new Error(`Could not find <${tagName}> with id="${id}" in the approved SVG source.`);
  }

  return match[0];
}

function extractElement(sourceSvg, tagName, attributePattern, label) {
  const pattern = new RegExp(`<${tagName}\\b(?=[^>]*${attributePattern})[^>]*\\/?>`, 'm');
  const match = sourceSvg.match(pattern);

  if (!match) {
    throw new Error(`Could not find ${label} in the approved SVG source.`);
  }

  return match[0];
}

function extractGroupInner(groupElement) {
  return groupElement
    .replace(/^<g\b[^>]*>/, '')
    .replace(/<\/g>\s*$/, '')
    .trim();
}

function withClass(element, className) {
  if (/\sclass=/.test(element)) {
    return element.replace(/\sclass=(["'])(.*?)\1/, ` class="${className} $2"`);
  }

  return element.replace(/^<([a-zA-Z][\w:-]*)\b/, `<$1 class="${className}"`);
}

function sourceHash(sourceSvg) {
  return createHash('sha256').update(sourceSvg).digest('hex').slice(0, 16);
}

function buildRuntimeSvg(sourceSvg) {
  const hash = sourceHash(sourceSvg);
  const silhouette = extractGroupInner(extractElementById(sourceSvg, 'g', 'goblinSilhouette'));
  const hatGradient = extractElementById(sourceSvg, 'linearGradient', 'hatGrad');
  const skinGradient = extractElementById(sourceSvg, 'linearGradient', 'skinGrad');
  const shortsGradient = extractElementById(sourceSvg, 'linearGradient', 'shortsGrad');

  const body = [
    withClass(extractElement(sourceSvg, 'path', 'fill="url\\(#skinGrad\\)"', 'main skin body'), 'goblin-skin'),
    withClass(extractElement(sourceSvg, 'rect', 'x="852"', 'left foot'), 'goblin-left-foot'),
    withClass(extractElement(sourceSvg, 'path', 'fill="#9aca43"', 'right foot'), 'goblin-right-foot')
  ].join('\n      ');

  const arms = [
    withClass(extractElement(sourceSvg, 'path', 'fill="#94c744"', 'left leg'), 'goblin-left-leg'),
    withClass(extractElement(sourceSvg, 'path', 'fill="#99c948"', 'right arm'), 'goblin-right-arm')
  ].join('\n      ');

  const skinShading = [
    extractElement(sourceSvg, 'rect', 'x="894"', 'body shadow'),
    extractElement(sourceSvg, 'rect', 'x="728"', 'body highlight'),
    extractElement(sourceSvg, 'path', 'fill="#8bbd3b"', 'body side shade')
  ].join('\n      ');

  const hat = [
    extractElement(sourceSvg, 'path', 'fill="url\\(#hatGrad\\)"', 'hat body'),
    extractElement(sourceSvg, 'rect', 'x="791"', 'hat dark fold'),
    extractElement(sourceSvg, 'path', 'fill="#2f5f27"', 'hat brim'),
    extractElement(sourceSvg, 'rect', 'x="656"', 'hat highlight'),
    extractElement(sourceSvg, 'path', 'fill="#2f5d29"', 'hat side shade')
  ].join('\n      ');

  const clothes = [
    extractElement(sourceSvg, 'path', 'fill="url\\(#shortsGrad\\)"', 'shorts body'),
    withClass(extractElement(sourceSvg, 'path', 'fill="#b7863f"', 'belt'), 'goblin-belt'),
    extractElement(sourceSvg, 'path', 'fill="#3c281f"', 'shorts shadow')
  ].join('\n      ');

  const eye = withClass(extractElement(sourceSvg, 'rect', 'x="1148"', 'pixel eye'), 'goblin-eye');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="256" height="300" viewBox="500 440 980 1140"
     role="img" aria-labelledby="goblin-title goblin-desc">
  <!-- source-sha256:${hash} -->
  <title id="goblin-title">Goblin coding companion</title>
  <desc id="goblin-desc">A side-profile pixel goblin with a floppy hat, long nose, one black eye, small body, and brown satchel.</desc>

  <defs>
    ${hatGradient}
    ${skinGradient}
    ${shortsGradient}

    <linearGradient id="goblin-satchel-gradient" x1="940" y1="1160" x2="1130" y2="1390" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#b98545"/>
      <stop offset="62%" stop-color="#765033"/>
      <stop offset="100%" stop-color="#4a2f22"/>
    </linearGradient>
  </defs>

  <g id="goblin-character" class="goblin-character" shape-rendering="crispEdges">
    <g class="goblin-outline" fill="#020403">
      ${silhouette}
    </g>

    <g class="goblin-body">
      ${body}
    </g>

    <g class="goblin-skin-shading">
      ${skinShading}
    </g>

    <g class="goblin-nose">
      <path fill="#abd84d" opacity="0.72" d="M1258 973 H1413 V1085 H1286 V1198 H1210 V1130 H1290 V1056 H1218 V1002 H1258 Z"/>
      <rect x="1364" y="1034" width="49" height="51" fill="#7fb33a" opacity="0.34"/>
    </g>

    <g class="goblin-hat">
      ${hat}
    </g>

    <g class="goblin-satchel">
      <path class="goblin-satchel-strap" fill="#5b3a25" opacity="0.72"
            d="M835 1052 H900 V1108 H954 V1165 H1013 V1230 H1062 V1295 H1019 V1250 H962 V1190 H908 V1132 H835 Z"/>
      <path class="goblin-satchel-bag" fill="url(#goblin-satchel-gradient)"
            d="M966 1215 H1130 V1300 H1091 V1376 H946 V1288 H966 Z"/>
      <rect class="goblin-satchel-flap" x="998" y="1238" width="92" height="33" fill="#c18a48" opacity="0.84"/>
      <rect class="goblin-satchel-shadow" x="1017" y="1300" width="44" height="38" fill="#3f281f" opacity="0.30"/>
    </g>

    <g class="goblin-clothes">
      ${clothes}
    </g>

    <g class="goblin-arms">
      ${arms}
    </g>

    ${eye}
  </g>
</svg>`;
}

const sourceSvg = await readFile(canonicalSourcePath, 'utf8');
assertApprovedSource(sourceSvg);

const runtimeSvg = `${buildRuntimeSvg(sourceSvg)}\n`;

await mkdir(dirname(canonicalSourcePath), { recursive: true });
await mkdir(dirname(outputPath), { recursive: true });
await mkdir(pluginAssetDir, { recursive: true });

await writeFile(canonicalSourcePath, sourceSvg, 'utf8');
await writeFile(outputPath, runtimeSvg, 'utf8');
await writeFile(pluginIconPath, runtimeSvg, 'utf8');
await access(pluginPreviewPath);

console.log(`Built ${relative(projectRoot, outputPath)} from ${relative(projectRoot, canonicalSourcePath)}`);
console.log(`Synced plugin assets in ${relative(projectRoot, pluginAssetDir)}`);
