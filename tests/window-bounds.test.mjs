import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { clampBounds } = require('../src/desktop/window-bounds.cjs');

const primaryWorkArea = { height: 1040, width: 1920, x: 0, y: 0 };

test('a window saved at the left or top screen edge keeps x=0 and y=0', () => {
  assert.deepEqual(clampBounds({ height: 520, width: 360, x: 0, y: 0 }, primaryWorkArea), {
    height: 520,
    width: 360,
    x: 0,
    y: 0,
  });
  assert.equal(clampBounds({ height: 520, width: 360, x: 0, y: 400 }, primaryWorkArea).x, 0);
  assert.equal(clampBounds({ height: 520, width: 360, x: 700, y: 0 }, primaryWorkArea).y, 0);
});

test('missing saved bounds fall back to the default top-right position', () => {
  assert.deepEqual(clampBounds(undefined, primaryWorkArea), {
    height: 520,
    width: 360,
    x: 1920 - 360 - 56,
    y: 72,
  });
});

test('non-finite saved coordinates fall back to defaults', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, null, undefined, '40', {}]) {
    const bounds = clampBounds({ height: 520, width: 360, x: value, y: value }, primaryWorkArea);

    assert.equal(bounds.x, 1920 - 360 - 56, `x=${String(value)} should use the default`);
    assert.equal(bounds.y, 72, `y=${String(value)} should use the default`);
  }
});

test('saved positions are clamped into the work area', () => {
  assert.deepEqual(clampBounds({ height: 520, width: 360, x: 5000, y: 5000 }, primaryWorkArea), {
    height: 520,
    width: 360,
    x: 1920 - 360,
    y: 1040 - 520,
  });
  assert.deepEqual(clampBounds({ height: 520, width: 360, x: -40, y: -40 }, primaryWorkArea), {
    height: 520,
    width: 360,
    x: 0,
    y: 0,
  });

  const offsetWorkArea = { height: 1000, width: 1800, x: 100, y: 40 };
  const atOrigin = clampBounds({ height: 520, width: 360, x: 0, y: 0 }, offsetWorkArea);
  assert.equal(atOrigin.x, 100, 'x=0 left of a shifted work area should clamp to its left edge');
  assert.equal(atOrigin.y, 40, 'y=0 above a shifted work area should clamp to its top edge');
});

test('window size stays within the supported range', () => {
  assert.deepEqual(clampBounds({ height: 9999, width: 9999, x: 0, y: 0 }, primaryWorkArea), {
    height: 680,
    width: 520,
    x: 0,
    y: 0,
  });
  assert.deepEqual(clampBounds({ height: 10, width: 10, x: 0, y: 0 }, primaryWorkArea), {
    height: 320,
    width: 260,
    x: 0,
    y: 0,
  });
});
