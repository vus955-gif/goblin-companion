const DEFAULT_POSITION = Object.freeze({ x: 24, y: 24 });
const POSITION_STORAGE_KEY = 'goblin-companion:position';

function hasFiniteCoordinates(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && Number.isFinite(value.x)
      && Number.isFinite(value.y),
  );
}

function roundAndClampCoordinate(value) {
  return Math.max(0, Math.round(value));
}

function normalizeFinitePosition(value) {
  return {
    x: roundAndClampCoordinate(value.x),
    y: roundAndClampCoordinate(value.y),
  };
}

export function normalizePosition(value, fallback = DEFAULT_POSITION) {
  if (hasFiniteCoordinates(value)) {
    return normalizeFinitePosition(value);
  }

  // Gdy zapis jest uszkodzony albo niepelny, wracamy do pozycji awaryjnej,
  // a sama pozycje awaryjna tez normalizujemy dla spojnosci.
  if (hasFiniteCoordinates(fallback)) {
    return normalizeFinitePosition(fallback);
  }

  return normalizeFinitePosition(DEFAULT_POSITION);
}

export function loadPosition(storage, fallback = DEFAULT_POSITION) {
  const safeFallback = normalizePosition(fallback);

  if (!storage || typeof storage.getItem !== 'function') {
    return safeFallback;
  }

  try {
    const rawPosition = storage.getItem(POSITION_STORAGE_KEY);

    if (rawPosition === null || rawPosition === undefined || rawPosition === '') {
      return safeFallback;
    }

    return normalizePosition(JSON.parse(rawPosition), safeFallback);
  } catch (error) {
    return safeFallback;
  }
}

export function savePosition(storage, position) {
  const safePosition = normalizePosition(position);

  if (!storage || typeof storage.setItem !== 'function') {
    return safePosition;
  }

  try {
    storage.setItem(POSITION_STORAGE_KEY, JSON.stringify(safePosition));
  } catch (error) {
    return safePosition;
  }

  return safePosition;
}
