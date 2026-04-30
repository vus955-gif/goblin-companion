import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const mainPath = resolve(projectRoot, "src", "desktop", "main.cjs");
const isWindows = process.platform === "win32";

function findElectronExecutable() {
  const candidates = [
    process.env.ELECTRON_PATH,
    isWindows ? resolve(projectRoot, "node_modules", "electron", "dist", "electron.exe") : null,
    resolve(projectRoot, "node_modules", ".bin", isWindows ? "electron.cmd" : "electron")
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function explainMissingElectron() {
  console.error("Goblin Companion desktop fallback needs Electron.");
  console.error("Run this once inside the project folder:");
  console.error("");
  console.error("  npm install");
  console.error("");
  console.error("Then start the always-on-top companion with:");
  console.error("");
  console.error("  npm run desktop");
}

function launchDesktopFallback() {
  const electronPath = findElectronExecutable();

  if (!electronPath) {
    explainMissingElectron();
    process.exitCode = 1;
    return;
  }

  let child;

  try {
    child = spawn(electronPath, [mainPath], {
      cwd: projectRoot,
      detached: true,
      env: {
        ...process.env,
        GOBLIN_COMPANION_ROOT: projectRoot
      },
      stdio: "ignore",
      windowsHide: true
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  child.unref();
  console.log("Goblin Companion desktop fallback launched.");
  console.log("It runs as a transparent, always-on-top companion window over Codex.");
}

launchDesktopFallback();
