import { pickComment } from "../companion/comments.js";
import { GOBLIN_STATES, resolveGoblinState } from "../companion/goblin-state-machine.js";
import { setGoblinState } from "../companion/goblin-renderer.js";

const widget = document.querySelector("#goblinWidget");
const artMount = document.querySelector("[data-goblin-art]");
const tokenCount = document.querySelector("[data-token-count]");
const feedButton = document.querySelector("[data-feed-button]");
const stateButtons = Array.from(document.querySelectorAll("[data-state-button]"));
const debugControls = document.querySelector("[data-debug-controls]");
const desktopWindowBar = document.querySelector("[data-desktop-window-bar]");
const windowCommandButtons = Array.from(document.querySelectorAll("[data-window-command]"));
const desktopInteractiveSelector = "[data-desktop-interactive], button, a, input, select, textarea, [role='button']";

const TOKEN_KEY = "goblin-companion-overlay-token-count";
const DEFAULT_STATE = GOBLIN_STATES.IDLE;
const commentIndexes = new Map();
const urlParams = new URLSearchParams(window.location?.search ?? "");
const desktopApi = window.goblinDesktop ?? null;
const isDesktopMode = Boolean(desktopApi) || urlParams.get("desktop") === "1";
const isDebugMode = urlParams.get("debug") === "1";

const signalByState = {
  [GOBLIN_STATES.IDLE]: {},
  [GOBLIN_STATES.HAPPY]: { testsGreen: true },
  [GOBLIN_STATES.SAD]: { minutesSinceCommit: 90 },
  [GOBLIN_STATES.SICK]: { hasBug: true },
  [GOBLIN_STATES.SLEEPING]: { idleMinutes: 10 },
  [GOBLIN_STATES.TYPING]: { isTyping: true },
  [GOBLIN_STATES.ALERT]: { hasUncaughtException: true },
  [GOBLIN_STATES.FEED]: { wasFed: true }
};

let currentState = DEFAULT_STATE;
let tokensFed = loadTokenCount();
let lastDesktopInteractiveMode = null;

function configureSurfaceMode() {
  if (!isDesktopMode) {
    return;
  }

  document.body.classList.add("desktop-mode");

  if (isDebugMode) {
    document.body.classList.add("is-debug");
  }

  if (desktopWindowBar) {
    desktopWindowBar.hidden = false;
  }

  if (debugControls && !isDebugMode) {
    debugControls.setAttribute("aria-hidden", "true");
  }
}

function loadTokenCount() {
  try {
    const storedValue = Number(window.localStorage?.getItem(TOKEN_KEY));
    return Number.isFinite(storedValue) && storedValue >= 0 ? Math.round(storedValue) : 0;
  } catch (error) {
    console.warn("Goblin Companion overlay could not read token count.", error);
    return 0;
  }
}

function saveTokenCount(value) {
  try {
    window.localStorage?.setItem(TOKEN_KEY, String(value));
  } catch (error) {
    console.warn("Goblin Companion overlay could not save token count.", error);
  }
}

function nextComment(state) {
  const index = commentIndexes.get(state) ?? 0;
  commentIndexes.set(state, index + 1);
  return pickComment(state, index);
}

function setActiveButton(state) {
  stateButtons.forEach((button) => {
    const isActive = button.dataset.stateButton === state;
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function updateTokenDisplay() {
  if (tokenCount) {
    tokenCount.textContent = String(tokensFed);
  }
}

function resolveState(requestedState) {
  const signals = signalByState[requestedState] ?? signalByState[DEFAULT_STATE];
  return resolveGoblinState(signals);
}

function renderResolvedState(state, options = {}) {
  const nextState = state || DEFAULT_STATE;
  const shouldRefreshComment = Boolean(options.comment) || options.repeatComment || nextState !== currentState;
  const speech = widget?.querySelector("[data-goblin-speech]");
  const comment = shouldRefreshComment
    ? options.comment ?? nextComment(nextState)
    : speech?.textContent ?? "";

  currentState = nextState;
  setGoblinState(widget, currentState, comment);
  setActiveButton(currentState);
}

function applyState(requestedState, options = {}) {
  renderResolvedState(resolveState(requestedState), {
    repeatComment: true,
    ...options
  });
}

function applySignals(signals, comment) {
  const resolvedState = resolveGoblinState(signals);
  renderResolvedState(resolvedState, {
    comment,
    repeatComment: false
  });
}

function feedGoblin() {
  tokensFed += 1;
  saveTokenCount(tokensFed);
  updateTokenDisplay();
  applyState(GOBLIN_STATES.FEED);
}

function setDesktopInteractiveMode(isInteractive) {
  if (!desktopApi || lastDesktopInteractiveMode === isInteractive) {
    return;
  }

  lastDesktopInteractiveMode = isInteractive;
  desktopApi.setInteractiveMode(isInteractive);
}

function mountFallbackAsset() {
  const fallback = document.createElement("div");
  fallback.className = "goblin-fallback";
  fallback.textContent = "Build /assets/goblin.svg to wake the goblin.";
  artMount.replaceChildren(fallback);
}

async function loadGoblinAsset() {
  try {
    const response = await fetch(resolveAssetUrl("/assets/goblin.svg"), { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Goblin SVG returned ${response.status}`);
    }

    const svgText = await response.text();
    const svgDocument = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = svgDocument.querySelector("svg");

    if (!svg || svgDocument.querySelector("parsererror")) {
      throw new Error("Goblin SVG could not be parsed.");
    }

    svg.classList.add("goblin-svg");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("data-goblin-svg", "true");
    artMount.replaceChildren(svg);
  } catch (error) {
    console.warn("Goblin Companion overlay could not load inline SVG animation rig.", error);
    mountFallbackAsset();
  }
}

function resolveAssetUrl(path) {
  const normalizedPath = String(path || "").replace(/^\/+/, "");

  if (window.location?.protocol === "file:") {
    return new URL(`../../${normalizedPath}`, window.location.href).href;
  }

  return `/${normalizedPath}`;
}

function bindControls() {
  feedButton?.addEventListener("click", feedGoblin);

  stateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const requestedState = button.dataset.stateButton;
      if (requestedState === GOBLIN_STATES.FEED) {
        feedGoblin();
        return;
      }

      applyState(requestedState);
    });
  });

  window.addEventListener("message", (event) => {
    const requestedState = event.data?.state;
    if (typeof requestedState === "string") {
      applyState(requestedState);
    }
  });

  windowCommandButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const command = button.dataset.windowCommand;
      desktopApi?.sendWindowCommand(command);
    });
  });

  if (desktopApi) {
    desktopApi.onSignals((payload) => {
      if (!payload || typeof payload !== "object") {
        return;
      }

      if (typeof payload.state === "string") {
        applyState(payload.state, {
          comment: payload.comment,
          repeatComment: Boolean(payload.comment)
        });
        return;
      }

      applySignals(payload.signals, payload.comment);
    });

    window.addEventListener("pointermove", (event) => {
      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
      setDesktopInteractiveMode(Boolean(hoveredElement?.closest(desktopInteractiveSelector)));
    });

    window.addEventListener("pointerleave", () => {
      setDesktopInteractiveMode(false);
    });
  }
}

function bootOverlay() {
  configureSurfaceMode();
  loadGoblinAsset();
  updateTokenDisplay();
  bindControls();
  applyState(currentState);
}

bootOverlay();
