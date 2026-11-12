const { execFile } = require("node:child_process");
const { createServer } = require("node:http");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, ipcMain, powerMonitor, screen } = require("electron");
const { createEventBridgeHandler } = require("./event-bridge.cjs");
const { createForegroundWindowProbe } = require("./foreground-window.cjs");

const DEFAULT_EVENT_PORT = 48735;
const AUTO_SIGNAL_INTERVAL_MS = 2500;
const EXTERNAL_EVENT_TTL_MS = 20000;
const WINDOW_STATE_FILE = "desktop-window-state.json";
const VALID_STATES = new Set([
  "idle",
  "happy",
  "sad",
  "sick",
  "sleeping",
  "typing",
  "alert",
  "feed"
]);

const projectRoot = process.env.GOBLIN_COMPANION_ROOT || path.resolve(__dirname, "..", "..");
const monitoredWorkspace = process.env.GOBLIN_WORKSPACE || null;
const eventPort = Number(process.env.GOBLIN_EVENT_PORT) || DEFAULT_EVENT_PORT;

let mainWindow = null;
let eventServer = null;
let latestExternalEvent = null;
let latestForegroundWindow = null;
let autoSignalTimer = null;
// Jeden dlugo zyjacy proces PowerShell zamiast nowego procesu i kompilacji C# co 2,5 s.
const foregroundWindowProbe = createForegroundWindowProbe({
  onFailure: (reason, consecutiveFailures) => {
    console.warn(`Goblin Companion foreground window helper failed (${consecutiveFailures}x): ${reason}`);
  }
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function getStateFilePath() {
  return path.join(app.getPath("userData"), WINDOW_STATE_FILE);
}

function readDesktopState() {
  const statePath = getStateFilePath();

  if (!existsSync(statePath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch (error) {
    console.warn("Goblin Companion could not read desktop state.", error);
    return {};
  }
}

function writeDesktopState(state) {
  const statePath = getStateFilePath();

  try {
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn("Goblin Companion could not save desktop state.", error);
  }
}

function clampBounds(bounds) {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(Math.max(Number(bounds?.width) || 360, 260), 520);
  const height = Math.min(Math.max(Number(bounds?.height) || 520, 320), 680);
  const x = Math.min(
    Math.max(Number(bounds?.x) || workArea.x + workArea.width - width - 56, workArea.x),
    workArea.x + workArea.width - width
  );
  const y = Math.min(
    Math.max(Number(bounds?.y) || workArea.y + 72, workArea.y),
    workArea.y + workArea.height - height
  );

  return {
    height: Math.round(height),
    width: Math.round(width),
    x: Math.round(x),
    y: Math.round(y)
  };
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  writeDesktopState({
    bounds: mainWindow.getBounds()
  });
}

function scheduleWindowBoundsSave() {
  clearTimeout(scheduleWindowBoundsSave.timer);
  scheduleWindowBoundsSave.timer = setTimeout(saveWindowBounds, 250);
}

function stateToSignals(state) {
  switch (state) {
    case "alert":
      return { hasUncaughtException: true };
    case "feed":
      return { wasFed: true };
    case "sick":
      return { hasBug: true };
    case "happy":
      return { testsGreen: true };
    case "sad":
      return { minutesSinceCommit: 90 };
    case "typing":
      return { isTyping: true };
    case "sleeping":
      return { idleMinutes: 10 };
    default:
      return {};
  }
}

function sendSignals(payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("goblin:signals", {
    ...payload,
    now: Date.now()
  });
}

function isEventFresh(event) {
  return Boolean(event && Date.now() - event.receivedAt <= EXTERNAL_EVENT_TTL_MS);
}

function getFreshExternalSignals() {
  if (!isEventFresh(latestExternalEvent)) {
    latestExternalEvent = null;
    return {};
  }

  return {
    comment: latestExternalEvent.comment,
    signals: stateToSignals(latestExternalEvent.state),
    state: latestExternalEvent.state
  };
}

function startEventBridge() {
  eventServer = createServer(
    createEventBridgeHandler({
      onEvent: ({ comment, state }) => {
        latestExternalEvent = {
          comment,
          receivedAt: Date.now(),
          state
        };

        sendSignals({
          comment,
          signals: stateToSignals(state),
          source: "event-bridge",
          state
        });
      },
      port: eventPort,
      validStates: VALID_STATES
    })
  );

  eventServer.listen(eventPort, "127.0.0.1", () => {
    console.log(`Goblin Companion event bridge: http://127.0.0.1:${eventPort}/event`);
  });

  eventServer.on("error", (error) => {
    console.warn("Goblin Companion event bridge could not start.", error);
  });
}

function pollForegroundWindow() {
  foregroundWindowProbe.sample().then((foregroundWindow) => {
    latestForegroundWindow = foregroundWindow;
  });
}

function isCodexForeground() {
  const processName = String(latestForegroundWindow?.ProcessName || "");
  const title = String(latestForegroundWindow?.Title || "");
  return /codex|openai/i.test(processName) || /codex/i.test(title);
}

function getMinutesSinceLastCommit() {
  if (!monitoredWorkspace || !existsSync(path.join(monitoredWorkspace, ".git"))) {
    return undefined;
  }

  return new Promise((resolve) => {
    execFile(
      "git",
      ["log", "-1", "--format=%ct"],
      {
        cwd: monitoredWorkspace,
        timeout: 1800,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }

        const timestampSeconds = Number(stdout.trim());
        if (!Number.isFinite(timestampSeconds)) {
          resolve(undefined);
          return;
        }

        resolve(Math.max(0, (Date.now() - timestampSeconds * 1000) / 60000));
      }
    );
  });
}

async function buildAutoSignals() {
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const external = getFreshExternalSignals();
  const minutesSinceCommit = await getMinutesSinceLastCommit();

  return {
    comment: external.comment,
    signals: {
      idleMinutes: idleSeconds / 60,
      isTyping: isCodexForeground() && idleSeconds < 20,
      minutesSinceCommit,
      ...external.signals
    },
    source: external.state ? "event-bridge+desktop-auto" : "desktop-auto",
    state: external.state
  };
}

async function publishAutoSignals() {
  pollForegroundWindow();
  sendSignals(await buildAutoSignals());
}

function startAutoSignals() {
  autoSignalTimer = setInterval(() => {
    publishAutoSignals().catch((error) => {
      console.warn("Goblin Companion could not publish desktop signals.", error);
    });
  }, AUTO_SIGNAL_INTERVAL_MS);

  publishAutoSignals().catch((error) => {
    console.warn("Goblin Companion could not publish initial desktop signals.", error);
  });
}

function createMainWindow() {
  const savedState = readDesktopState();
  const bounds = clampBounds(savedState.bounds);

  mainWindow = new BrowserWindow({
    ...bounds,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    maximizable: false,
    minimizable: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    title: "Goblin Companion",
    transparent: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile(path.join(projectRoot, "src", "overlay", "index.html"), {
    query: {
      desktop: "1"
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.showInactive();
    publishAutoSignals().catch(() => {});
  });

  mainWindow.on("moved", scheduleWindowBoundsSave);
  mainWindow.on("resized", scheduleWindowBoundsSave);
  mainWindow.on("close", saveWindowBounds);
}

ipcMain.handle("goblin:window-command", (_event, command) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  if (command === "close") {
    mainWindow.close();
    return true;
  }

  if (command === "minimize") {
    mainWindow.minimize();
    return true;
  }

  if (command === "toggle-pin") {
    const shouldPin = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(shouldPin, "screen-saver");
    return shouldPin;
  }

  return false;
});

ipcMain.handle("goblin:interactive-mode", (_event, isInteractive) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  // Tryb domyslny przepuszcza klikniecia do Codex. Renderer wlacza interakcje
  // tylko nad paskiem i karta goblina, gdzie potrzebne sa karmienie oraz drag.
  mainWindow.setIgnoreMouseEvents(!isInteractive, { forward: true });
  return Boolean(isInteractive);
});

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.showInactive();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
  });

  app.whenReady().then(() => {
    app.setName("Goblin Companion");
    startEventBridge();
    createMainWindow();
    startAutoSignals();
  });
}

app.on("before-quit", () => {
  if (autoSignalTimer) {
    clearInterval(autoSignalTimer);
  }

  foregroundWindowProbe.dispose();

  if (eventServer) {
    eventServer.close();
  }
});

process.on("exit", () => {
  foregroundWindowProbe.dispose();
});

app.on("window-all-closed", () => {
  app.quit();
});
