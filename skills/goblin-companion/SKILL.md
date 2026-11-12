---
name: goblin-companion
description: Use when the user asks to display, launch, tune, or interact with the Goblin Companion coding overlay in Codex.
---

# Goblin Companion

Use this skill when the user wants the goblin companion to appear during a Codex coding session.

## Launch

From the plugin/project root, run:

```powershell
npm run build:asset
npm run build:codex-avatar
npm run install:codex-avatar
```

This builds the approved SVG source, generates the native Codex avatar spritesheet, installs it into `C:\Users\<you>\.codex\avatars\goblin-companion`, selects `custom:goblin-companion`, and asks Codex to open its built-in avatar overlay. If the running Codex window does not refresh immediately, restart Codex once.

Selecting the avatar edits Codex Desktop's internal state file, `~/.codex/.codex-global-state.json`, after writing a timestamped backup next to it. Tell the user before running the installer. If they do not want Codex state edited, run `npm run install:codex-avatar -- --no-state` instead; it only copies the avatar files, and the user picks the avatar in Codex settings.

If Codex does not show the Avatar settings section, use the Windows desktop fallback instead:

```powershell
npm install
npm run desktop
```

Send reaction events to the running fallback with:

```powershell
npm run event -- happy
npm run event -- sick "The test suite just coughed up a stack trace."
```

## Notes

- Native Codex avatar support may not be exposed in every Codex Desktop build or account yet.
- The Electron desktop fallback is the working visible companion surface on Windows when the native Avatar UI is unavailable.
- Codex controls live state changes automatically: active work maps to `running`, waiting maps to `waiting`, errors map to `failed`, review-ready/success maps to `review`, hover maps to `jumping`, and drag movement maps to `running-left` / `running-right`.
- The static demo remains available at `npm start` and `http://127.0.0.1:4173/src/demo/`.
