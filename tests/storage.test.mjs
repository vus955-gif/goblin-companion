import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadPosition,
  normalizePosition,
  savePosition,
} from '../src/companion/storage.js';

function createMemoryStorage(initialEntries = {}) {
  const entries = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    entries,
  };
}

test('normalizePosition rounds finite coordinates and clamps negative values to zero', () => {
  assert.deepEqual(normalizePosition({ x: 12.4, y: 8.6 }), { x: 12, y: 9 });
  assert.deepEqual(normalizePosition({ x: -3.2, y: -0.6 }), { x: 0, y: 0 });
  assert.deepEqual(normalizePosition({ x: 3.9, y: -2 }), { x: 4, y: 0 });
});

test('normalizePosition falls back safely for missing or non-finite coordinates', () => {
  assert.deepEqual(normalizePosition(undefined), { x: 24, y: 24 });
  assert.deepEqual(normalizePosition(null), { x: 24, y: 24 });
  assert.deepEqual(normalizePosition({ x: Number.NaN, y: 1 }), { x: 24, y: 24 });
  assert.deepEqual(normalizePosition({ x: 1, y: Number.POSITIVE_INFINITY }), { x: 24, y: 24 });
  assert.deepEqual(normalizePosition({ x: '4', y: 5 }, { x: 7.7, y: -2 }), { x: 8, y: 0 });
});

test('loadPosition returns fallback for absent storage, missing values, and malformed JSON', () => {
  assert.deepEqual(loadPosition(null, { x: 5, y: 6 }), { x: 5, y: 6 });
  assert.deepEqual(loadPosition(undefined, { x: 5, y: 6 }), { x: 5, y: 6 });

  const emptyStorage = createMemoryStorage();
  assert.deepEqual(loadPosition(emptyStorage, { x: 9.2, y: -3 }), { x: 9, y: 0 });

  const malformedStorage = {
    getItem() {
      return '{definitely not json';
    },
  };
  assert.deepEqual(loadPosition(malformedStorage, { x: 11, y: 12 }), { x: 11, y: 12 });
});

test('savePosition normalizes positions and loadPosition reads the saved value', () => {
  const storage = createMemoryStorage();

  const saved = savePosition(storage, { x: 18.7, y: -4 });

  assert.deepEqual(saved, { x: 19, y: 0 });
  assert.deepEqual(loadPosition(storage), { x: 19, y: 0 });
});

test('savePosition handles absent or failing storage without throwing', () => {
  assert.deepEqual(savePosition(null, { x: 2.2, y: 3.8 }), { x: 2, y: 4 });
  assert.deepEqual(savePosition(undefined, { x: 2.2, y: 3.8 }), { x: 2, y: 4 });

  const failingStorage = {
    setItem() {
      throw new Error('storage quota exceeded');
    },
  };

  assert.doesNotThrow(() => savePosition(failingStorage, { x: 6.6, y: 1.1 }));
  assert.deepEqual(savePosition(failingStorage, { x: 6.6, y: 1.1 }), { x: 7, y: 1 });
});
