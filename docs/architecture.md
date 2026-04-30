# Architecture

Goblin Companion has two runtime paths:

1. Native Codex avatar assets.
2. Windows desktop fallback.

The native path is the cleanest long-term integration. The project generates a Codex-compatible custom avatar package under:

```text
assets/codex-avatar/goblin-companion/
```

The installer copies that package to:

```text
C:\Users\<you>\.codex\avatars\goblin-companion
```

Codex Desktop may not expose its Avatar UI in every Windows build or account yet. When that UI is unavailable, the fallback path uses Electron to create a transparent, frameless, always-on-top companion window. This avoids patching Codex and keeps the integration local and reversible.

## Main Modules

- `src/companion/comments.js` holds the English comment pools.
- `src/companion/goblin-state-machine.js` resolves coding signals into goblin states.
- `src/companion/goblin-renderer.js` applies state classes and speech text.
- `src/overlay/` is the shared renderer surface used by the desktop fallback.
- `src/desktop/` is the Electron main/preload layer.
- `scripts/build-codex-avatar.mjs` generates the native Codex spritesheet.
- `scripts/install-codex-avatar.mjs` installs the native avatar package.
- `scripts/start-desktop.mjs` launches the Windows fallback.
- `scripts/goblin-event.mjs` sends local state events to a running fallback.

## State Priority

When several signals are active, the state machine uses this order:

1. `alert`
2. `feed`
3. `sick`
4. `happy`
5. `sad`
6. `typing`
7. `sleeping`
8. `idle`

## Safety Notes

- The desktop fallback does not patch Codex files.
- The fallback is click-through by default, so transparent parts do not block Codex.
- The local event bridge listens only on `127.0.0.1`.
- Event payloads and custom comments are size-limited.
