// Granice okna liczone bez Electrona, zeby dalo sie je testowac zwyklym Node.
const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 520;
const MIN_WIDTH = 260;
const MAX_WIDTH = 520;
const MIN_HEIGHT = 320;
const MAX_HEIGHT = 680;
const DEFAULT_RIGHT_MARGIN = 56;
const DEFAULT_TOP_MARGIN = 72;

// `Number(value) || fallback` traktowalo 0 jak brak wartosci, wiec okno zapisane
// przy lewej albo gornej krawedzi ekranu wracalo na pozycje domyslna.
function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clampBounds(bounds, workArea) {
  const width = Math.min(Math.max(finiteOr(bounds?.width, DEFAULT_WIDTH), MIN_WIDTH), MAX_WIDTH);
  const height = Math.min(Math.max(finiteOr(bounds?.height, DEFAULT_HEIGHT), MIN_HEIGHT), MAX_HEIGHT);
  const x = Math.min(
    Math.max(finiteOr(bounds?.x, workArea.x + workArea.width - width - DEFAULT_RIGHT_MARGIN), workArea.x),
    workArea.x + workArea.width - width
  );
  const y = Math.min(
    Math.max(finiteOr(bounds?.y, workArea.y + DEFAULT_TOP_MARGIN), workArea.y),
    workArea.y + workArea.height - height
  );

  return {
    height: Math.round(height),
    width: Math.round(width),
    x: Math.round(x),
    y: Math.round(y)
  };
}

module.exports = {
  clampBounds
};
