import { pickComment } from "../companion/comments.js";
import { GOBLIN_STATES, resolveGoblinState } from "../companion/goblin-state-machine.js";
import { loadPosition, savePosition } from "../companion/storage.js";
import {
  applyGoblinPosition,
  clampPosition,
  setGoblinState
} from "../companion/goblin-renderer.js";

const widget = document.querySelector("#goblinWidget");
const artMount = document.querySelector("[data-goblin-art]");
const tokenCount = document.querySelector("[data-token-count]");
const feedButton = document.querySelector("[data-feed-button]");
const stateButtons = Array.from(document.querySelectorAll("[data-state-button]"));
const dragHandle = document.querySelector("[data-goblin-drag-handle]");

const TOKEN_KEY = "goblin-companion-token-count";
const DEFAULT_STATE = GOBLIN_STATES.IDLE;
const commentIndexes = new Map();

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
let dragSession = null;

// Licznik karmienia jest osobny od pozycji, bo opisuje stan demo, a nie ustawienie widżetu.
function loadTokenCount() {
  try {
    const storedValue = Number(window.localStorage?.getItem(TOKEN_KEY));
    return Number.isFinite(storedValue) && storedValue >= 0 ? Math.round(storedValue) : 0;
  } catch (error) {
    console.warn("Goblin Companion could not read token count.", error);
    return 0;
  }
}

function saveTokenCount(value) {
  try {
    window.localStorage?.setItem(TOKEN_KEY, String(value));
  } catch (error) {
    console.warn("Goblin Companion could not save token count.", error);
  }
}

// Każde kliknięcie przesuwa indeks, dzięki czemu komentarze nie powtarzają się od razu.
function nextComment(state) {
  const index = commentIndexes.get(state) ?? 0;
  commentIndexes.set(state, index + 1);
  return pickComment(state, index);
}

function getViewport() {
  return {
    height: window.innerHeight,
    width: window.innerWidth
  };
}

function getWidgetSize() {
  const rect = widget.getBoundingClientRect();
  return {
    height: rect.height,
    width: rect.width
  };
}

function defaultPosition() {
  return {
    x: Math.max(16, window.innerWidth - 350),
    y: Math.max(16, window.innerHeight - 340)
  };
}

// Zapisujemy tylko już przyciętą pozycję, aby odświeżenie strony nie zgubiło widżetu poza ekranem.
function setPosition(position, shouldSave = false) {
  const clamped = clampPosition(position, getViewport(), getWidgetSize(), 16);
  applyGoblinPosition(widget, clamped);

  if (shouldSave) {
    try {
      savePosition(window.localStorage, clamped);
    } catch (error) {
      console.warn("Goblin Companion could not save position.", error);
    }
  }

  return clamped;
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

// Demo używa tych samych sygnałów, których później może dostarczyć realna integracja.
function resolveState(requestedState) {
  const signals = signalByState[requestedState] ?? signalByState[DEFAULT_STATE];
  return resolveGoblinState(signals);
}

function applyState(requestedState) {
  currentState = resolveState(requestedState);
  setGoblinState(widget, currentState, nextComment(currentState));
  setActiveButton(currentState);
}

function feedGoblin() {
  tokensFed += 1;
  saveTokenCount(tokensFed);
  updateTokenDisplay();
  applyState(GOBLIN_STATES.FEED);
}

function mountFallbackAsset() {
  const fallback = document.createElement("div");
  fallback.className = "goblin-fallback";
  fallback.textContent = "Build /assets/goblin.svg to wake the goblin.";
  artMount.replaceChildren(fallback);
}

async function loadGoblinAsset() {
  try {
    const response = await fetch("/assets/goblin.svg", { cache: "no-store" });

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
    console.warn("Goblin Companion could not load inline SVG animation rig.", error);
    mountFallbackAsset();
  }
}

// Przeciąganie działa na Pointer Events, więc ta sama ścieżka obsługuje mysz, dotyk i piórko.
function startDrag(event) {
  if (event.button !== 0 && event.pointerType !== "touch") {
    return;
  }

  const rect = widget.getBoundingClientRect();
  dragSession = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };

  widget.dataset.dragging = "true";
  dragHandle.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!dragSession) {
    return;
  }

  setPosition({
    x: event.clientX - dragSession.offsetX,
    y: event.clientY - dragSession.offsetY
  });
}

function endDrag(event) {
  if (!dragSession) {
    return;
  }

  const rect = widget.getBoundingClientRect();
  dragSession = null;
  widget.dataset.dragging = "false";

  try {
    dragHandle.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture can already be released when the pointer leaves the window.
  }

  setPosition({ x: rect.left, y: rect.top }, true);
}

function handleKeyboardDrag(event) {
  const step = event.shiftKey ? 28 : 12;
  const rect = widget.getBoundingClientRect();
  const movements = {
    ArrowDown: { x: rect.left, y: rect.top + step },
    ArrowLeft: { x: rect.left - step, y: rect.top },
    ArrowRight: { x: rect.left + step, y: rect.top },
    ArrowUp: { x: rect.left, y: rect.top - step }
  };
  const nextPosition = movements[event.key];

  if (!nextPosition) {
    return;
  }

  event.preventDefault();
  setPosition(nextPosition, true);
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

  dragHandle?.addEventListener("pointerdown", startDrag);
  dragHandle?.addEventListener("pointermove", moveDrag);
  dragHandle?.addEventListener("pointerup", endDrag);
  dragHandle?.addEventListener("pointercancel", endDrag);
  dragHandle?.addEventListener("keydown", handleKeyboardDrag);

  window.addEventListener("resize", () => {
    const rect = widget.getBoundingClientRect();
    setPosition({ x: rect.left, y: rect.top }, true);
  });
}

function bootDemo() {
  loadGoblinAsset();
  updateTokenDisplay();
  bindControls();

  const storedPosition = loadPosition(window.localStorage, defaultPosition());
  requestAnimationFrame(() => setPosition(storedPosition, true));
  applyState(currentState);
}

bootDemo();
