# Physio cards on openGym: design

Date: 2026-10-05

## Goal

The user does six physiotherapy exercises twice a day and wants to track them on his iPhone.
The app is openGym itself, built as a static site, preloaded with his six exercise cards,
hosted free on GitHub Pages. Success: he opens the home-screen app, sees how many of today's
two sessions are done, runs a guided session with the card pictures, and finds it in History.

## Decisions already made

- Build on openGym's UI and code rather than a new app.
- History lives on the iPhone only. No server, no login, no sync.
- All six exercises, twice a day.
- Host on GitHub Pages from a public fork.
- Crop the footer (patient and therapist names, date) out of the card images.

## What openGym already provides

- A server-less build. `VITE_DEMO=1` boots straight into guest mode with state in
  `localStorage` and seeds a profile once (`frontend/src/lib/demo.js`,
  `frontend/src/store/useStore.js:1463-1471`).
- A Pages workflow that builds and deploys that static bundle (`.github/workflows/pages.yml`).
- Custom exercises with their own picture (`customEx`, `c.media`; `frontend/src/sheets.jsx:998-1008`).
- Timed sets with a hold timer and chime (`target: { mode: 'time', sets, sec }`;
  `frontend/src/views/Workout.hold.test.jsx:22`).
- A second session on the same day. Home already tolerates it but does not ask for it: after
  the first session the row reads "Done" (`frontend/src/views/Home.jsx:44-45`, `:79-100`).
- Backup export and import, with photos (`frontend/src/lib/backup-media.js`).

## Changes

### 1. A physio build flag

A new build-time flag, `VITE_PHYSIO=1`, alongside `VITE_DEMO`. It takes the same boot path as
the demo (guest mode, no API calls, seed once) but loads the physio seed instead of the
fabricated 12-week history, and hides the demo-only UI (demo banner, "reset demo"). Upstream
builds without the flag are unchanged.

### 2. The seed (`frontend/src/lib/physioSeed.js`)

Runs once, guarded by its own `localStorage` key, and only when the profile holds no data.
It creates six custom exercises and one routine.

| # | Exercise | Target |
|---|----------|--------|
| 1 | Double Leg Lift | 2 sets × 12 reps |
| 2 | Bilateral Hip IR AROM | 3 sets × 12 reps, 2 s hold per rep |
| 3 | Thoracic Extension (Opener) | 2 sets × 45 s hold (card: 30–45 s) |
| 4 | Archer | 2 sets × 12 reps |
| 5 | Chin Tuck | 1 set × 10 reps, 10 s hold per rep |
| 6 | Supine Lying (Foam Roller) | 1 set × 60 s (card: 30–60 s) |

Exercises 3 and 6 use openGym's timed mode, so the hold timer runs. Exercises 2 and 5 are
rep-counted; the per-rep hold goes in the exercise note, because openGym has no per-rep
timer and adding one is out of scope. Each exercise's description carries the card's
Preparation and Execution text. All are bodyweight, with no load to enter.

The routine "Daily physio" holds the six in card order and is assigned to all seven weekdays.
Rest time between sets defaults to 30 s instead of openGym's 90 s.

### 3. Card images

A one-off script converts the six PDFs to WebP, crops the footer line, and writes them to
`frontend/public/physio/`. They ship as static assets in the bundle, so they work offline
and survive a cleared media store. The seed points each exercise's picture at its asset.
How a custom exercise references a bundled file, rather than a hash in the local media
store, is the first thing the implementation plan must settle; the fallback is to load the
bundled files into the media store during seeding.

The PDFs themselves are not committed.

### 4. Twice-a-day on Home

A pure helper, `sessionsToday(S, iso)`, returns how many sessions are logged for a day, with a
unit test beside it. In the physio build the Home "Today" row uses it against a target of 2:

- 0 of 2: routine name, "Start" tag (as today).
- 1 of 2: "1 of 2 done", "Start" tag still shown, tap starts the second session.
- 2 of 2: "2 of 2 done", green "Done" tag.

The week strip's dot stays as upstream: filled once a day has any session.

### 5. Deployment

- Fork `DuarteSantos8/openGym` to the user's GitHub account; work on a branch, merge to the
  fork's `main`.
- `pages.yml` builds with `VITE_PHYSIO=1` in place of `VITE_DEMO=1`. The CDN settings for the
  built-in exercise library's media stay as they are.
- Enable Pages (source: GitHub Actions) on the fork. The app is served at
  `https://<user>.github.io/openGym/`.
- On the iPhone: open in Safari, Share, Add to Home Screen.

## Data and privacy

State is in the home-screen app's `localStorage`. Deleting the app deletes the history, so
the seed leaves openGym's backup export in place and the README for the fork says to use it.
The public site and repo contain the exercise names, instructions and cropped pictures, and
no names or dates of people.

## Licence

openGym is AGPL-3.0-or-later. The modified source is public in the fork, which satisfies it.
The card pictures are the physiotherapy provider's material; they are published at the user's
decision.

## Testing

- Unit tests (vitest) for `physioSeed.js`: six exercises, targets as in the table, routine on
  all seven days, no second seeding, no seeding over existing data.
- Unit tests for `sessionsToday`.
- A Home view test for the three states of the Today row.
- The existing frontend suite still passes.
- Manual check of the deployed site at iPhone viewport size: seed appears, a session runs
  with pictures and hold timer, two sessions count to 2 of 2, the app works offline after
  install.

## Out of scope

Sync, login, reminders and push notifications, a per-rep hold timer, per-exercise frequency
(Archer's "2–3× / day"), and changes to the built-in exercise library.
