export function stateClassName(state) {
  return `goblin-widget is-${state || "idle"}`;
}

export function setGoblinState(root, state, comment) {
  if (!root) {
    return;
  }

  root.className = stateClassName(state);

  const speech = root.querySelector("[data-goblin-speech]");
  if (speech) {
    speech.textContent = comment ?? "";
  }
}

export function clampNumber(value, min, max) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : min;
  return Math.min(Math.max(safeValue, min), max);
}

// Ogranicza pozycję przeciąganego widżetu do widocznego obszaru ekranu.
export function clampPosition(position, viewport, widgetSize, padding = 16) {
  const safeViewport = {
    width: Math.max(1, Number(viewport?.width) || 1),
    height: Math.max(1, Number(viewport?.height) || 1)
  };
  const safeWidgetSize = {
    width: Math.max(1, Number(widgetSize?.width) || 1),
    height: Math.max(1, Number(widgetSize?.height) || 1)
  };
  const safePadding = Math.max(0, Number(padding) || 0);

  return {
    x: Math.round(
      clampNumber(
        position?.x,
        safePadding,
        Math.max(safePadding, safeViewport.width - safeWidgetSize.width - safePadding)
      )
    ),
    y: Math.round(
      clampNumber(
        position?.y,
        safePadding,
        Math.max(safePadding, safeViewport.height - safeWidgetSize.height - safePadding)
      )
    )
  };
}

// Stosuje pozycję jako stałe współrzędne, żeby widżet nie mieszał left/top z right/bottom.
export function applyGoblinPosition(root, position) {
  if (!root || !position) {
    return;
  }

  root.style.left = `${Math.round(position.x)}px`;
  root.style.top = `${Math.round(position.y)}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
}
