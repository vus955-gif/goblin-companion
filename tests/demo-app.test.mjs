import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, '..');
const appPath = resolve(projectRoot, 'src', 'demo', 'app.js');

class FakeStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

class FakeElement {
  constructor({ className = '', dataset = {}, rect = {} } = {}) {
    this.attributes = new Map();
    this.children = [];
    this.className = className;
    this.dataset = { ...dataset };
    this.listeners = new Map();
    this.queryMap = new Map();
    this.rect = {
      height: 40,
      left: 0,
      top: 0,
      width: 40,
      ...rect,
    };
    this.style = {};
    this.textContent = '';
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) ?? [];
    handlers.forEach((handler) => handler(event));
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  querySelector(selector) {
    return this.queryMap.get(selector) ?? null;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  getBoundingClientRect() {
    const left = Number.parseFloat(this.style.left) || this.rect.left;
    const top = Number.parseFloat(this.style.top) || this.rect.top;

    return {
      bottom: top + this.rect.height,
      height: this.rect.height,
      left,
      right: left + this.rect.width,
      top,
      width: this.rect.width,
    };
  }

  setPointerCapture() {}

  releasePointerCapture() {}
}

class FakeSvgElement extends FakeElement {
  constructor() {
    super({ className: 'runtime-svg' });
    this.classList = {
      add: (className) => {
        this.className = `${this.className} ${className}`.trim();
      },
      contains: (className) => this.className.split(/\s+/).includes(className),
    };
  }
}

class FakeDOMParser {
  parseFromString() {
    const svg = new FakeSvgElement();

    return {
      querySelector(selector) {
        return selector === 'svg' ? svg : null;
      },
    };
  }
}

function createFakeWindow() {
  const listeners = new Map();

  return {
    innerHeight: 620,
    innerWidth: 900,
    localStorage: new FakeStorage(),
    addEventListener(type, handler) {
      const handlers = listeners.get(type) ?? [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    dispatchEvent(event) {
      const handlers = listeners.get(event.type) ?? [];
      handlers.forEach((handler) => handler(event));
    },
  };
}

function createDemoDom() {
  const widget = new FakeElement({
    className: 'goblin-widget is-idle',
    rect: { height: 300, width: 306 },
  });
  const artMount = new FakeElement();
  const tokenCount = new FakeElement();
  const feedButton = new FakeElement();
  const dragHandle = new FakeElement();
  const speech = new FakeElement();
  const stateButtons = ['idle', 'happy', 'sad', 'sick', 'sleeping', 'typing', 'alert', 'feed'].map(
    (state) => new FakeElement({ dataset: { stateButton: state } })
  );
  const queryMap = new Map([
    ['#goblinWidget', widget],
    ['[data-goblin-art]', artMount],
    ['[data-token-count]', tokenCount],
    ['[data-feed-button]', feedButton],
    ['[data-goblin-drag-handle]', dragHandle],
  ]);

  widget.queryMap.set('[data-goblin-speech]', speech);

  const document = {
    querySelector(selector) {
      return queryMap.get(selector) ?? null;
    },
    querySelectorAll(selector) {
      return selector === '[data-state-button]' ? stateButtons : [];
    },
  };

  return {
    artMount,
    document,
    dragHandle,
    feedButton,
    speech,
    stateButtons,
    tokenCount,
    widget,
  };
}

function setGlobal(name, value, cleanup) {
  const hadOwnValue = Object.prototype.hasOwnProperty.call(globalThis, name);
  const previousValue = globalThis[name];
  globalThis[name] = value;

  cleanup.push(() => {
    if (hadOwnValue) {
      globalThis[name] = previousValue;
    } else {
      delete globalThis[name];
    }
  });
}

test('demo app loads the goblin asset, switches states, feeds tokens, and persists drag position', async (t) => {
  const cleanup = [];
  t.after(() => {
    cleanup.reverse().forEach((restore) => restore());
  });

  const fakeWindow = createFakeWindow();
  const dom = createDemoDom();

  setGlobal('window', fakeWindow, cleanup);
  setGlobal('document', dom.document, cleanup);
  setGlobal('DOMParser', FakeDOMParser, cleanup);
  setGlobal('fetch', async (url) => ({
    ok: url === '/assets/goblin.svg',
    status: url === '/assets/goblin.svg' ? 200 : 404,
    async text() {
      return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    },
  }), cleanup);
  setGlobal('requestAnimationFrame', (callback) => {
    callback();
    return 1;
  }, cleanup);

  await import(`${pathToFileURL(appPath).href}?demo-app-test=${Date.now()}`);

  assert.ok(dom.artMount.children[0].classList.contains('goblin-svg'));
  assert.equal(dom.artMount.children[0].getAttribute('data-goblin-svg'), 'true');
  assert.equal(dom.widget.className, 'goblin-widget is-idle');
  assert.equal(dom.stateButtons[0].getAttribute('aria-pressed'), 'true');

  const alertButton = dom.stateButtons.find((button) => button.dataset.stateButton === 'alert');
  alertButton.click();
  assert.equal(dom.widget.className, 'goblin-widget is-alert');
  assert.equal(alertButton.getAttribute('aria-pressed'), 'true');
  assert.match(dom.speech.textContent, /Critical alert|Uncaught exception|Red lights|serious error|runtime/i);

  dom.feedButton.click();
  assert.equal(dom.tokenCount.textContent, '1');
  assert.equal(fakeWindow.localStorage.getItem('goblin-companion-token-count'), '1');
  assert.equal(dom.widget.className, 'goblin-widget is-feed');

  const beforeDrag = dom.widget.getBoundingClientRect();
  dom.dragHandle.dispatchEvent({
    button: 0,
    clientX: beforeDrag.left + 20,
    clientY: beforeDrag.top + 20,
    pointerId: 1,
    pointerType: 'mouse',
    type: 'pointerdown',
  });
  dom.dragHandle.dispatchEvent({
    clientX: beforeDrag.left + 90,
    clientY: beforeDrag.top + 72,
    type: 'pointermove',
  });
  dom.dragHandle.dispatchEvent({
    pointerId: 1,
    type: 'pointerup',
  });

  const savedPosition = JSON.parse(fakeWindow.localStorage.getItem('goblin-companion:position'));
  assert.ok(savedPosition.x > beforeDrag.left, 'dragging should move and save x');
  assert.ok(savedPosition.y > beforeDrag.top, 'dragging should move and save y');

  fakeWindow.innerWidth = 360;
  fakeWindow.innerHeight = 340;
  fakeWindow.dispatchEvent({ type: 'resize' });

  const clampedPosition = JSON.parse(fakeWindow.localStorage.getItem('goblin-companion:position'));
  assert.ok(clampedPosition.x <= 38, 'resize should clamp x inside the narrow viewport');
  assert.ok(clampedPosition.y <= 24, 'resize should clamp y inside the short viewport');
});
