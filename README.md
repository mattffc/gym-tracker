# Gym Tracker

Last updated: 2026-11-05

An offline gym log you install from the browser. No app store, no account, no server.

**Live:** https://mattffc.github.io/gym-tracker/

## Status (2026-11-05): v1

- **Log:** exercise, kg, reps and optional RPE, with autocomplete and the last set filled in. Live e1RM (RPE-adjusted when you give an RPE, otherwise Epley). Today's sets and best e1RM per lift.
- **Programme:** the 16-week, 5-day template (sets x reps, %1RM, RPE, rest, tempo), suggested kg from your best e1RM, and "Log this".
- **Progress:** best-e1RM chart per lift with PRs marked, a next-session suggestion (+2.5 kg when every set hit target at RPE 8 or less, hold or back off otherwise), session history, and plateau alerts (no PR in 4+ weeks while still training the lift).
- **Backup:** save a JSON backup, restore it (merges, no duplicates), export CSV.
- Installs as an app and works offline.

## Install on Android

1. Open the URL above in **Chrome**.
2. Tap the **Install** button in the app header, or open the Chrome menu (three dots) and tap **Add to Home screen**, then **Install**.
3. Open it from the home screen. It runs full screen and works without signal.

## Your data stays on your phone

Everything is saved in the browser's local storage on your phone. Nothing is uploaded, and nothing personal is in this repo.

- Clearing Chrome's site data, or uninstalling the app, **deletes your log**.
- Use **Save backup** on the Log tab now and then, and **Restore** to move your log to another phone.

## Development

Plain HTML, CSS and JS with no build step. To run it locally:

```
python -m http.server 8000
```

Then open http://localhost:8000. Run `node test.js` for the e1RM checks. Bump `CACHE` in `sw.js` whenever you change shell files.
