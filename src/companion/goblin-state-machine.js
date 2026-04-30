export const GOBLIN_STATES = Object.freeze({
  IDLE: 'idle',
  HAPPY: 'happy',
  SAD: 'sad',
  SICK: 'sick',
  SLEEPING: 'sleeping',
  TYPING: 'typing',
  ALERT: 'alert',
  FEED: 'feed',
});

export const STATE_PRIORITY = Object.freeze([
  GOBLIN_STATES.ALERT,
  GOBLIN_STATES.FEED,
  GOBLIN_STATES.SICK,
  GOBLIN_STATES.HAPPY,
  GOBLIN_STATES.SAD,
  GOBLIN_STATES.TYPING,
  GOBLIN_STATES.SLEEPING,
  GOBLIN_STATES.IDLE,
]);

function hasReachedThreshold(value, threshold) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) && numericValue >= threshold;
}

export function resolveGoblinState(signals = {}) {
  const currentSignals = signals && typeof signals === 'object' ? signals : {};

  // Kolejnosc ponizszych warunkow jest celowa: od najpilniejszych alarmow
  // do neutralnego stanu, aby slabsze sygnaly nie przykryly wazniejszego.
  if (currentSignals.hasUncaughtException || currentSignals.hasCriticalError) {
    return GOBLIN_STATES.ALERT;
  }

  if (currentSignals.wasFed) {
    return GOBLIN_STATES.FEED;
  }

  if (currentSignals.hasBug || currentSignals.hasFailingCheck || currentSignals.hasBrokenRuntime) {
    return GOBLIN_STATES.SICK;
  }

  if (currentSignals.testsGreen || currentSignals.buildSuccess) {
    return GOBLIN_STATES.HAPPY;
  }

  if (hasReachedThreshold(currentSignals.minutesSinceCommit, 90)) {
    return GOBLIN_STATES.SAD;
  }

  if (currentSignals.isTyping) {
    return GOBLIN_STATES.TYPING;
  }

  if (hasReachedThreshold(currentSignals.idleMinutes, 10)) {
    return GOBLIN_STATES.SLEEPING;
  }

  return GOBLIN_STATES.IDLE;
}
