# Gym Tracker

Last updated: 2026-11-05

An offline gym log you install from the browser. No app store, no account, no server.

**Live:** https://mattffc.github.io/gym-tracker/

## Status (2026-11-05): painted door v0

- Works now: log a set (exercise, kg, reps), with exercise autocomplete and the last weight and reps filled in for you. Shows estimated 1RM (Epley) as you type. Lists today's sets and your best e1RM per exercise. Installs as an app and works offline.
- Coming soon (shown as cards in the app): progress charts, progression helper, plateau alerts, JSON/CSV backup, RPE-adjusted e1RM and full sessions. `calc.js` already has the maths for these (Epley, Brzycki, RPE table, plateau check, next-weight suggestion).

## Install on Android

1. Open the URL above in **Chrome**.
2. Tap the **Install** button in the app header, or open the Chrome menu (three dots) and tap **Add to Home screen**, then **Install**.
3. Open it from the home screen. It runs full screen and works without signal.

## Your data stays on your phone

Everything is saved in the browser's local storage on your phone. Nothing is uploaded, and nothing personal is in this repo.

- Clearing Chrome's site data, or uninstalling the app, **deletes your log**.
- Export and backup aren't built yet, so for now there's no way to move your data to another device.

## Development

Plain HTML, CSS and JS with no build step. To run it locally:

```
python -m http.server 8000
```

Then open http://localhost:8000. Run `node test.js` for the e1RM checks. Bump `CACHE` in `sw.js` whenever you change shell files.
