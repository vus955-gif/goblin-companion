import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const avatarId = 'goblin-companion';
const sourceDir = resolve(projectRoot, 'assets', 'codex-avatar', avatarId);
const sourceManifestPath = resolve(sourceDir, 'avatar.json');
const sourceSpritesheetPath = resolve(sourceDir, 'spritesheet.png');
const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
const targetDir = join(codexHome, 'avatars', avatarId);
const targetManifestPath = join(targetDir, 'avatar.json');
const targetSpritesheetPath = join(targetDir, 'spritesheet.png');
const globalStatePath = join(codexHome, '.codex-global-state.json');
const patchState = !process.argv.includes('--no-state');

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

async function assertBuiltAvatarExists() {
  const missing = [];

  if (!existsSync(sourceManifestPath)) {
    missing.push(sourceManifestPath);
  }

  if (!existsSync(sourceSpritesheetPath)) {
    missing.push(sourceSpritesheetPath);
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing built Codex avatar files:\n${missing.map((path) => `- ${path}`).join('\n')}\nRun npm run build:codex-avatar first.`,
    );
  }
}

async function installAvatarFiles() {
  await mkdir(targetDir, { recursive: true });
  await copyFile(sourceManifestPath, targetManifestPath);
  await copyFile(sourceSpritesheetPath, targetSpritesheetPath);
}

async function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

async function selectNativeAvatar() {
  if (!existsSync(globalStatePath)) {
    console.warn(`Codex global state was not found at ${globalStatePath}. Avatar files were installed only.`);
    return false;
  }

  const rawState = await readFile(globalStatePath, 'utf8');
  let state;

  try {
    state = JSON.parse(rawState);
  } catch (error) {
    throw new Error(`Could not parse ${globalStatePath}: ${error.message}`);
  }

  const backupPath = join(dirname(globalStatePath), `${basename(globalStatePath)}.goblin-companion-backup-${timestamp()}`);
  await writeFile(backupPath, rawState, 'utf8');

  if (!state['electron-persisted-atom-state'] || typeof state['electron-persisted-atom-state'] !== 'object') {
    state['electron-persisted-atom-state'] = {};
  }

  // Te klucze sa uzywane przez desktopowego Codexa do wyboru avatara oraz
  // zapamietania, ze natywne okno avatara ma byc otwarte.
  state['electron-persisted-atom-state']['selected-avatar-id'] = `custom:${avatarId}`;
  state['electron-avatar-overlay-open'] = true;

  await writeJsonAtomically(globalStatePath, state);
  return backupPath;
}

await assertBuiltAvatarExists();
await installAvatarFiles();

let backupPath = null;

if (patchState) {
  backupPath = await selectNativeAvatar();
}

console.log(`Installed Codex avatar: ${targetDir}`);

if (backupPath) {
  console.log(`Selected native avatar custom:${avatarId}`);
  console.log(`Backed up Codex global state: ${backupPath}`);
} else if (!patchState) {
  console.log('Skipped Codex global state selection because --no-state was passed.');
}
