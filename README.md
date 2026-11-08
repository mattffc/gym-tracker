# Gym Tracker

Last updated: 2026-11-08

An offline training log you install from the browser. No app store, no account, no server.

**Live:** https://mattffc.github.io/gym-tracker/

## Status (2026-11-08): v2, coach-style blocks

- **Train:** the active 4-week block, day by day, laid out like a coach's sheet: sets × reps, % 1RM with a kg range, target RPE, rest, tempo, notes, and last time's numbers. Every prescribed set has its own row for kg, reps and **actual RPE**; tap ✓ to log (tap again to edit or remove). Plus a free logger for unplanned sets.
- **Body:** daily check-in for sleep (h), stress (/10), bodyweight and a note, with trend charts.
- **Progress:** current e1RM for squat / bench / deadlift with the 4-week change and total × bodyweight, plain-English coach notes (strength trend, RPE harder/easier than planned, workload spikes, poor sleep or high stress), e1RM chart per lift, a weekly table (sets, tonnage, RPE vs target, intensity, best e1RM, ACWR, plus sleep / stress / bodyweight), plateau alerts and history.
- **Data:** a **block report** to hand to Claude for the next block, **import programme** (see [PROGRAMME_FORMAT.md](PROGRAMME_FORMAT.md)), backup / restore, CSV exports, training 1RMs, and the theme (light by default, dark, or match the phone).
- Installs as an app and works offline.

## Install on Android

1. Open the URL above in **Chrome**.
2. Tap **Install** in the app header, or Chrome menu (three dots) → **Add to Home screen** → **Install**.
3. Open it from the home screen. It runs full screen and works without signal.

## Your data stays on your phone

Everything is saved in the browser's local storage on the phone. Nothing is uploaded, and nothing personal is in this repo (no names, 1RMs or logs).

- Clearing Chrome's site data, or uninstalling the app, **deletes your log**.
- Use **Save backup** on the Data tab now and then.

## Development

Plain HTML, CSS and JS with no build step: `python -m http.server 8000`, then open http://localhost:8000. Run `node test.js` for the maths checks. Bump `CACHE` in `sw.js` whenever you change shell files.
