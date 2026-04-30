# Reaction Testing

Use this checklist when polishing the goblin before a release, update, or visual pass.

## Start

```powershell
npm install
npm run desktop
```

Confirm:

- The goblin appears above Codex.
- Transparent parts of the companion window do not block Codex clicks or typing.
- The goblin can be moved by dragging the top bar or goblin card.

## Manual Events

```powershell
npm run event -- typing "Typing detected. Please let this be implementation, not panic sculpture."
npm run event -- sick "Checks are failing, which is the system saying no with receipts."
npm run event -- alert "Uncaught exception detected; evidence has entered the room."
npm run event -- happy "Tests are green; I will allow one tasteful victory lap."
npm run event -- feed "Snack received. The intentional failures have been digested."
npm run event -- sleeping "Nap mode engaged. Wake me when the code has a plan."
npm run event -- sad "The branch misses small commits and emotional closure."
```

## Expected Visuals

- `typing`: laptop appears and the hand motion reads as typing.
- `sick`: animated puke sprite appears away from the nose.
- `alert`: red marks appear above the head.
- `happy`: visible jump and lifted existing limbs.
- `feed`: token moves toward the mouth and chewing marks appear.
- `sleeping`: Zzz bubble appears.
- `sad`: tear appears and motion feels slower or droopier.

## Practical Red-Green Test

1. Send `typing`.
2. Create or enable a deliberately failing test.
3. Run `npm test`.
4. Send `sick` or `alert`.
5. Fix the test.
6. Run `npm test` again.
7. Send `happy`, then `feed`.

The current smoke test for this flow is:

```text
tests/reaction-smoke.test.mjs
```
