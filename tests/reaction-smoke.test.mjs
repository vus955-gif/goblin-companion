import assert from 'node:assert/strict';
import test from 'node:test';

import { pickComment } from '../src/companion/comments.js';
import { resolveGoblinState } from '../src/companion/goblin-state-machine.js';

test('reaction smoke: bug signal resolves to sick state', () => {
  assert.equal(resolveGoblinState({ hasBug: true }), 'sick');
});

test('reaction smoke: alert state has a visible reviewer comment', () => {
  assert.match(pickComment('alert', 0), /Critical alert|exception|error|runtime/i);
});
