import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOBLIN_STATES,
  STATE_PRIORITY,
  resolveGoblinState,
} from '../src/companion/goblin-state-machine.js';

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

test('exports all required goblin state names and the documented priority order', () => {
  assert.deepEqual([...Object.values(GOBLIN_STATES)].sort(), [...REQUIRED_STATES].sort());
  assert.deepEqual(STATE_PRIORITY, [
    'alert',
    'feed',
    'sick',
    'happy',
    'sad',
    'typing',
    'sleeping',
    'idle',
  ]);
});

test('resolveGoblinState returns idle when no trigger is active', () => {
  assert.equal(resolveGoblinState(), 'idle');
  assert.equal(resolveGoblinState({}), 'idle');
  assert.equal(resolveGoblinState(null), 'idle');
});

test('resolveGoblinState maps every individual trigger to the expected state', () => {
  assert.equal(resolveGoblinState({ hasUncaughtException: true }), 'alert');
  assert.equal(resolveGoblinState({ hasCriticalError: true }), 'alert');
  assert.equal(resolveGoblinState({ wasFed: true }), 'feed');
  assert.equal(resolveGoblinState({ hasBug: true }), 'sick');
  assert.equal(resolveGoblinState({ hasFailingCheck: true }), 'sick');
  assert.equal(resolveGoblinState({ hasBrokenRuntime: true }), 'sick');
  assert.equal(resolveGoblinState({ testsGreen: true }), 'happy');
  assert.equal(resolveGoblinState({ buildSuccess: true }), 'happy');
  assert.equal(resolveGoblinState({ minutesSinceCommit: 90 }), 'sad');
  assert.equal(resolveGoblinState({ isTyping: true }), 'typing');
  assert.equal(resolveGoblinState({ idleMinutes: 10 }), 'sleeping');
});

test('resolveGoblinState keeps threshold states inactive below their limits', () => {
  assert.equal(resolveGoblinState({ minutesSinceCommit: 89 }), 'idle');
  assert.equal(resolveGoblinState({ idleMinutes: 9 }), 'idle');
});

test('resolveGoblinState honors alert to idle priority when several signals are active', () => {
  assert.equal(
    resolveGoblinState({
      hasUncaughtException: true,
      wasFed: true,
      hasBug: true,
      testsGreen: true,
      minutesSinceCommit: 120,
      isTyping: true,
      idleMinutes: 20,
    }),
    'alert',
  );

  assert.equal(
    resolveGoblinState({
      wasFed: true,
      hasBug: true,
      testsGreen: true,
      minutesSinceCommit: 120,
      isTyping: true,
      idleMinutes: 20,
    }),
    'feed',
  );

  assert.equal(
    resolveGoblinState({
      hasFailingCheck: true,
      buildSuccess: true,
      minutesSinceCommit: 120,
      isTyping: true,
      idleMinutes: 20,
    }),
    'sick',
  );

  assert.equal(
    resolveGoblinState({
      testsGreen: true,
      minutesSinceCommit: 120,
      isTyping: true,
      idleMinutes: 20,
    }),
    'happy',
  );

  assert.equal(
    resolveGoblinState({
      minutesSinceCommit: 120,
      isTyping: true,
      idleMinutes: 20,
    }),
    'sad',
  );

  assert.equal(
    resolveGoblinState({
      isTyping: true,
      idleMinutes: 20,
    }),
    'typing',
  );
});
