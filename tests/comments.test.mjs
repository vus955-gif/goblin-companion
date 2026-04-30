import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMENT_POOLS,
  getCommentPool,
  pickComment,
} from '../src/companion/comments.js';

const REQUIRED_STATES = [
  'idle',
  'happy',
  'sad',
  'sick',
  'sleeping',
  'typing',
  'alert',
  'feed',
];

test('COMMENT_POOLS contains at least six usable comments for every required state', () => {
  for (const state of REQUIRED_STATES) {
    const pool = COMMENT_POOLS[state];

    assert.ok(Array.isArray(pool), `${state} should expose a comment array`);
    assert.ok(pool.length >= 6, `${state} should have at least six comments`);

    for (const comment of pool) {
      assert.equal(typeof comment, 'string');
      assert.ok(comment.trim().length >= 12, 'comments should be descriptive enough to show personality');
    }
  }
});

test('getCommentPool returns the requested pool and falls back to idle for unknown states', () => {
  assert.equal(getCommentPool('happy'), COMMENT_POOLS.happy);
  assert.equal(getCommentPool('sick'), COMMENT_POOLS.sick);
  assert.equal(getCommentPool('missing-state'), COMMENT_POOLS.idle);
  assert.equal(getCommentPool(undefined), COMMENT_POOLS.idle);
});

test('pickComment deterministically selects comments by finite numeric index', () => {
  const pool = COMMENT_POOLS.typing;

  assert.equal(pickComment('typing', 0), pool[0]);
  assert.equal(pickComment('typing', 1), pool[1]);
  assert.equal(pickComment('typing', pool.length), pool[0]);
  assert.equal(pickComment('typing', pool.length + 2), pool[2]);
  assert.equal(pickComment('typing', 2.9), pool[2]);
});

test('pickComment safely handles negative, non-numeric, and unknown-state input', () => {
  const idlePool = COMMENT_POOLS.idle;
  const alertPool = COMMENT_POOLS.alert;

  assert.equal(pickComment('alert', -1), alertPool.at(-1));
  assert.equal(pickComment('alert', -alertPool.length), alertPool[0]);
  assert.equal(pickComment('idle', Number.NaN), idlePool[0]);
  assert.equal(pickComment('idle', Number.POSITIVE_INFINITY), idlePool[0]);
  assert.equal(pickComment('idle', 'surely not a number'), idlePool[0]);
  assert.equal(pickComment('unknown-state', 3), idlePool[3]);
});
