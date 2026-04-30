import { readFile } from 'node:fs/promises';

const PUBLIC_TEXT_FILES = [
  'README.md',
  'docs/architecture.md',
  'docs/reaction-testing.md',
  'package.json',
  '.codex-plugin/plugin.json',
  'skills/goblin-companion/SKILL.md',
];

const FORBIDDEN_PHRASES = [
  ['first', 'public'],
  ['before', 'the', 'first'],
  ['polished', 'locally'],
  ['before', 'a', 'commit'],
  ['Git', 'Rule'],
  ['No', 'commits'],
  ['Do', 'not', 'commit'],
  ['owner', 'explicitly'],
  ['working', 'pieces'],
  ['published', 'MVP'],
  ['remote', 'feature', 'flag'],
  ['feature', 'gated'],
  ['hidden', 'behind'],
  ['C:', 'Users', 'vus95'],
  ['vus95', '.codex'],
  ['New', 'project', '2'],
  ['localhost:65320'],
  ['127.0.0.1:65320'],
];

function makePattern(parts) {
  const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('[\\s\\\\/._-]+'), 'i');
}

function getLineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/u).length;
}

async function main() {
  const patterns = FORBIDDEN_PHRASES.map((parts) => ({
    label: parts.join(' '),
    pattern: makePattern(parts),
  }));

  const findings = [];

  for (const filePath of PUBLIC_TEXT_FILES) {
    const content = await readFile(filePath, 'utf8');

    for (const { label, pattern } of patterns) {
      const match = pattern.exec(content);

      if (match) {
        findings.push({
          filePath,
          label,
          line: getLineNumber(content, match.index),
        });
      }
    }
  }

  if (findings.length > 0) {
    console.error('Release check failed. Public-facing files still contain draft/process wording:');

    for (const finding of findings) {
      console.error(`- ${finding.filePath}:${finding.line} -> ${finding.label}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log('Release check passed: public-facing docs and metadata do not contain blocked draft/process wording.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
