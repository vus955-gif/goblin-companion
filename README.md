# Goblin Companion

Goblin Companion is a local-first coding companion for Codex: a small pixel goblin that comments on coding sessions, reacts to development states, and can be fed token snacks.

The long-term target is Codex's native custom avatar surface. Because that Avatar UI may not be available in every Codex Desktop build or account yet, this repo also ships a clean Windows desktop fallback: a transparent, frameless, always-on-top Electron window that sits above Codex without patching Codex.

## Status

Goblin Companion is an early MVP. The supported visible surface on Windows is the desktop fallback; native Codex avatar assets are included for users whose Codex Desktop build exposes custom avatars.

Current capabilities:

- Native Codex avatar package generator.
- Native Codex avatar installer for `~/.codex/avatars/goblin-companion`.
- Windows desktop fallback with click-through transparent areas.
- Local event bridge for state reactions.
- SVG goblin renderer with state-specific animations.
- Static browser demo for visual iteration.
- Tests for assets, state machine, comments, desktop fallback, server, and reaction smoke flow.

## Features

- Snarky English reviewer-style comments.
- States: `idle`, `typing`, `happy`, `sad`, `sick`, `sleeping`, `alert`, and `feed`.
- Token feeding animation.
- Typing state with laptop.
- Sick state with animated puke sprite.
- Alert state with red marks.
- Happy state with jumping and lifted existing limbs.
- Sleeping state with Zzz bubble.
- Local-only event bridge on `127.0.0.1`.
- MIT license.

## Requirements

- Windows for the desktop fallback.
- Node.js `>=22.12` (required by Electron 41.10).
- npm.

## Install

```powershell
npm install
```

## Run The Desktop Fallback

```powershell
npm run desktop
```

The companion should appear above Codex. Transparent parts of the window are click-through, so they should not block normal Codex typing or clicking.

Send a reaction event:

```powershell
npm run event -- happy "Tests are green; I will allow one tasteful victory lap."
```

More examples:

```powershell
npm run event -- typing "Typing detected. Please let this be implementation, not panic sculpture."
npm run event -- sick "Checks are failing, which is the system saying no with receipts."
npm run event -- alert "Uncaught exception detected; evidence has entered the room."
npm run event -- feed "Snack received. The intentional failures have been digested."
```

Custom hooks or scripts can post to the bridge directly. The bridge accepts only `POST /event` with `Content-Type: application/json` and rejects any request that carries an `Origin` header, so web pages open in your browser cannot drive the goblin:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:48735/event -ContentType "application/json" -Body '{"state":"happy","comment":"Green across the board."}'
```

```bash
curl -X POST http://127.0.0.1:48735/event -H "Content-Type: application/json" -d '{"state":"sick"}'
```

To let the fallback judge "long time without a commit" for a real coding repo, point it at that workspace before launch:

```powershell
$env:GOBLIN_WORKSPACE="D:\Path\To\Your\Repo"
npm run desktop
```

## Native Codex Avatar

Build and install the native avatar assets:

```powershell
npm run build:asset
npm run build:codex-avatar
npm run install:codex-avatar
```

Generated native avatar files:

```text
assets/codex-avatar/goblin-companion/avatar.json
assets/codex-avatar/goblin-companion/spritesheet.png
assets/codex-avatar/goblin-companion/spritesheet.meta.json
```

Installed location:

```text
C:\Users\<you>\.codex\avatars\goblin-companion
```

If Codex settings do not show an Avatar section, the native UI is not enabled for the current app/account yet. Use `npm run desktop` in the meantime.

## Demo

Start the local demo server:

```powershell
npm start
```

Open:

```text
http://127.0.0.1:4173/src/demo/
```

The demo is for visual iteration. The product fallback is `npm run desktop`.

## Test

```powershell
npm test
```

## Release Check

```powershell
npm run release:check
```

This runs a public documentation and metadata scan, then the test suite.

Reaction testing notes are in:

```text
docs/reaction-testing.md
```

Architecture notes are in:

```text
docs/architecture.md
```

## Project Structure

```text
.codex-plugin/          Codex plugin manifest (paths in it resolve from the repo root)
assets/                 Goblin art source, plugin icon/preview, generated native avatar assets
docs/                   Public project notes
scripts/                Build, install, launch, and event scripts
skills/                 Local Codex skill metadata
src/companion/          Shared comments, state machine, storage, renderer helpers
src/desktop/            Electron desktop fallback main/preload
src/demo/               Static visual demo
src/overlay/            Shared overlay renderer used by desktop fallback
tests/                  Node test suite
```

## License

MIT. See `LICENSE`.
