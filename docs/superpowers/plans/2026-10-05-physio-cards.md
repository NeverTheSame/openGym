# Physio Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, server-less openGym build (`VITE_PHYSIO=1`) that seeds six physiotherapy exercises with card pictures and a daily routine, counts two sessions a day on Home, and deploys to GitHub Pages.

**Architecture:** A build flag beside upstream's `VITE_DEMO` takes the same no-backend boot path but loads a physio seed. Card pictures ship as static files under `frontend/public/physio/`; on boot they are copied into openGym's local media store under their sha256, which is the only way a custom exercise can reference a picture. Home's Today row counts sessions against a target of 2.

**Tech Stack:** React 19, Vite 8, Zustand, vitest + happy-dom, plain JavaScript (no TypeScript, no linter). Node 22. poppler (`pdftoppm`) for the one-off card conversion.

**Spec:** `docs/superpowers/specs/2026-10-05-physio-cards-design.md`

## Global Constraints

- Builds without `VITE_PHYSIO=1` must behave exactly as upstream. Every new branch is behind the flag.
- No server calls in the physio build: no `/api/*` request at boot or afterwards.
- The card footer (patient and therapist names, date) must not appear in any committed image, and no person's name or the card date in any committed file. The source PDFs are not committed.
- Match the surrounding code: no semicolons, single quotes, 2-space indent, the file's comment density. Pure logic goes in `frontend/src/lib/` with a `*.test.js` beside it (see `CONTRIBUTING.md`).
- User-visible strings go through `t()` from `lib/i18n.js`, as string literals.
- Commit after each task on branch `physio-cards`. Commit messages follow the repo style (`Area: what changed`). Do not add any `Co-Authored-By` or session trailer. Do not push.
- All commands run from `frontend/` unless stated. Tests: `npx vitest run <file>`; full suite: `npm test`.

## Review Focus

1. Existing data: a browser that already holds workouts or routines opens the physio build. Expected: nothing is seeded or overwritten. (Task 2 test.)
2. Media store emptied by iOS while `localStorage` survives. Expected: pictures come back on next boot, exercises are not duplicated. (Task 3 test.)
3. Picture fetch fails at first boot (offline, 404). Expected: exercises and routine are still seeded, the app opens, pictures are retried next boot. (Task 3 test.)
4. A third session in one day. Expected: Home reads "3 of 2 done" is wrong; it reads "2 of 2 done" and stays Done. (Task 4 test.)
5. A session started before midnight and finished after. Expected: it counts for the day openGym stores in `w.d`; the helper does no date math of its own. (Task 2 test pins that only `w.d` is compared.)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/scripts/physio-cards.sh` (create) | One-off: PDFs → cropped WebP + manifest |
| `frontend/public/physio/1.webp` … `6.webp` (create) | Card pictures served with the app |
| `frontend/src/lib/physio-cards.json` (create) | Manifest: per card `file`, `hash`, `size`, `width`, `height` |
| `frontend/src/lib/physio.js` (create) | Flag, constants, `sessionsOn`, `sessionProgress` |
| `frontend/src/lib/physioSeed.js` (create) | `buildPhysioState()` — exercises, routine, week |
| `frontend/src/lib/physio-media.js` (create) | `restorePhysioMedia()` — bundled files → media store |
| `frontend/src/lib/demo.js` (modify) | `NO_BACKEND = DEMO || PHYSIO` |
| `frontend/src/store/useStore.js` (modify) | Boot branch for the physio build |
| `frontend/src/views/Home.jsx` (modify) | Today row counts sessions |
| `frontend/src/views/Settings.jsx`, `Login.jsx`, `components/ServerSync.jsx`, `components/SyncBanner.jsx` (modify) | Hide backend-only UI |
| `.github/workflows/pages.yml` (modify) | Build with `VITE_PHYSIO=1` |

---

### Task 1: Card pictures and manifest

**Files:**
- Create: `frontend/scripts/physio-cards.sh`
- Create: `frontend/public/physio/1.webp` … `6.webp`
- Create: `frontend/src/lib/physio-cards.json`

**Interfaces:**
- Consumes: the folder holding the six source PDFs (outside the repo), the PDFs named `1_Double_Leg_Lift.pdf`, `2_Bilateral_Hip_IR_AROM.pdf`, `3_Thoracic_Extension_Opener.pdf`, `4_Archer.pdf`, `5_Chin_Tuck.pdf`, `6_Supine_Lying_Foam_Roller.pdf`. Each is one page, 432 × 288 pt.
- Produces: `physio-cards.json`, an array of six objects in card order:
  `{ "n": 1, "file": "physio/1.webp", "hash": "<64 hex sha256 of the file>", "size": <bytes>, "width": <px>, "height": <px> }`

- [ ] **Step 1: Write the script.** `physio-cards.sh <pdf-dir>` does, per card `n`:
  1. `pdftoppm -r 200 -png -singlefile "$pdf" "$tmp/$n"` (gives 1200 × 800 px).
  2. Crop the footer: keep the top 92% of the height (`sips -c <h*0.92> <w> --cropOffset 0 0`, or ImageMagick `magick … -gravity North -crop 100%x92%+0+0 +repage` if installed).
  3. Encode WebP at quality 82 to `public/physio/$n.webp` (`cwebp -q 82`, or `sips -s format webp` if `cwebp` is missing; check which exists with `command -v` and fail with a clear message if neither does).
  4. Append `n`, `file`, `shasum -a 256`, byte size, pixel width and height to the manifest, written as valid JSON.

  Use `set -euo pipefail`, a `mktemp -d` work directory, and quote every path.

- [ ] **Step 2: Run it.**

  Run: `bash scripts/physio-cards.sh "<the folder holding the six source PDFs (outside the repo)>"`
  Expected: six `.webp` files, each under 200 kB, and a six-entry manifest.

- [ ] **Step 3: Verify the crop by eye.** Open all six images with the Read tool. Each must show the exercise title, the sets/reps line and the drawings, and must not show the footer line. If any footer text is visible, lower the kept percentage and re-run; if a drawing or caption is cut, raise it. Then confirm no name survives as text:

  Run: a search for the names on the cards over `public/physio`, `src/lib/physio-cards.json` and `scripts/physio-cards.sh` (case-insensitive `grep -ril`, then `echo "exit $?"`).
  Expected: no file listed, `exit 1`.

- [ ] **Step 4: Verify the manifest matches the files.**

  Run: `node -e "const m=require('./src/lib/physio-cards.json');const c=require('crypto'),f=require('fs');for(const x of m){const b=f.readFileSync('public/'+x.file);if(c.createHash('sha256').update(b).digest('hex')!==x.hash||b.length!==x.size)throw new Error('mismatch '+x.n)}console.log('ok',m.length)"`
  Expected: `ok 6`

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/scripts/physio-cards.sh frontend/public/physio frontend/src/lib/physio-cards.json
  git commit -m "Physio: card pictures and their manifest"
  ```

---

### Task 2: Flag, session counting and the seed

**Files:**
- Create: `frontend/src/lib/physio.js`, `frontend/src/lib/physio.test.js`
- Create: `frontend/src/lib/physioSeed.js`, `frontend/src/lib/physioSeed.test.js`
- Modify: `frontend/src/lib/demo.js`

**Interfaces:**
- Consumes: `physio-cards.json` from Task 1.
- Produces:
  - `physio.js`: `PHYSIO` (boolean), `PHYSIO_SEEDED = 'gym_physio_seeded_v1'`, `SESSIONS_PER_DAY = 2`, `sessionsOn(S, iso) → number`, `sessionProgress(S, iso) → { done, target, complete }`
  - `physioSeed.js`: `PHYSIO_ROUTINE_ID = 'physio-daily'`, `buildPhysioState(cards = manifest) → { customEx, routines, week, restSec }`
  - `demo.js`: `NO_BACKEND` (boolean)

- [ ] **Step 1: Write the failing tests for `physio.js`.**

  ```js
  import { describe, expect, it } from 'vitest'
  import { sessionsOn, sessionProgress, SESSIONS_PER_DAY } from './physio.js'

  const S = n => ({ workouts: Array.from({ length: n }, (_, i) => ({ id: 'w' + i, d: '2026-10-05' })).concat({ id: 'y', d: '2026-10-04' }) })

  describe('sessionsOn', () => {
    it('counts the workouts stored under that day and no other', () => {
      expect(sessionsOn(S(2), '2026-10-05')).toBe(2)
      expect(sessionsOn(S(2), '2026-10-04')).toBe(1)
      expect(sessionsOn(S(2), '2026-10-06')).toBe(0)
    })
    it('compares the stored day only — a start time on another day changes nothing', () => {
      const s = { workouts: [{ d: '2026-10-05', start: new Date('2026-10-04T23:58:00').getTime() }] }
      expect(sessionsOn(s, '2026-10-05')).toBe(1)
      expect(sessionsOn(s, '2026-10-04')).toBe(0)
    })
    it('is 0 for a state with no workouts list', () => {
      expect(sessionsOn({}, '2026-10-05')).toBe(0)
      expect(sessionsOn(null, '2026-10-05')).toBe(0)
    })
  })

  describe('sessionProgress', () => {
    it('reports done against the daily target', () => {
      expect(SESSIONS_PER_DAY).toBe(2)
      expect(sessionProgress(S(0), '2026-10-05')).toEqual({ done: 0, target: 2, complete: false })
      expect(sessionProgress(S(1), '2026-10-05')).toEqual({ done: 1, target: 2, complete: false })
      expect(sessionProgress(S(2), '2026-10-05')).toEqual({ done: 2, target: 2, complete: true })
    })
    it('caps done at the target, so a third session still reads 2 of 2', () => {
      expect(sessionProgress(S(3), '2026-10-05')).toEqual({ done: 2, target: 2, complete: true })
    })
  })
  ```

- [ ] **Step 2: Run to see it fail.** `npx vitest run src/lib/physio.test.js` — expected: FAIL, cannot resolve `./physio.js`.

- [ ] **Step 3: Implement `physio.js`.**

  ```js
  // Physio build (VITE_PHYSIO=1): openGym with no backend, seeded with six physiotherapy
  // exercises that are done twice a day. Like the demo build (demo.js) it stays in guest mode
  // with everything in localStorage; unlike it, the profile is real and is never reset.
  export const PHYSIO = import.meta.env.VITE_PHYSIO === '1'
  export const PHYSIO_SEEDED = 'gym_physio_seeded_v1'
  export const SESSIONS_PER_DAY = 2

  /** How many sessions are logged under `iso`. The day is the one the workout was stored
   *  under (w.d) — no date math here, so it can never disagree with History. */
  export const sessionsOn = (S, iso) => (Array.isArray(S?.workouts) ? S.workouts : []).filter(w => w && w.d === iso).length

  /** Today's count against the target, capped: a third session is still "2 of 2". */
  export function sessionProgress(S, iso, target = SESSIONS_PER_DAY) {
    const done = Math.min(target, sessionsOn(S, iso))
    return { done, target, complete: done >= target }
  }
  ```

- [ ] **Step 4: Run to see it pass.** `npx vitest run src/lib/physio.test.js` — expected: PASS.

- [ ] **Step 5: Add `NO_BACKEND` to `demo.js`**, after the `DEMO` line:

  ```js
  import { PHYSIO } from './physio.js'
  // Any build that has no API at all — the demo, and the physio build (physio.js).
  export const NO_BACKEND = DEMO || PHYSIO
  ```

  Put the import at the top of the file, above the header comment's constants.

- [ ] **Step 6: Write the failing tests for the seed.**

  ```js
  import { describe, expect, it } from 'vitest'
  import { buildPhysioState, PHYSIO_ROUTINE_ID } from './physioSeed.js'
  import { normalizeMediaRef } from './media-refs.js'
  import { modeOf, isBw } from './history.js'
  import cards from './physio-cards.json'

  describe('buildPhysioState', () => {
    const st = buildPhysioState()
    const byName = n => st.routines[0].ex[st.customEx.findIndex(c => c.n === n)]

    it('creates the six exercises in card order, each a custom exercise', () => {
      expect(st.customEx.map(c => c.n)).toEqual([
        'Double Leg Lift', 'Bilateral Hip IR AROM', 'Thoracic Extension (Opener)',
        'Archer', 'Chin Tuck', 'Supine Lying (Foam Roller)'
      ])
      expect(st.customEx.every(c => c.custom === true && typeof c.id === 'string')).toBe(true)
      expect(new Set(st.customEx.map(c => c.id)).size).toBe(6)
    })

    it('gives every exercise a picture the app accepts, taken from the manifest', () => {
      st.customEx.forEach((c, i) => {
        expect(normalizeMediaRef(c.media)).not.toBeNull()
        expect(c.media.hash).toBe(cards[i].hash)
        expect(c.media.kind).toBe('image')
      })
    })

    it('carries the card text', () => {
      expect(st.customEx[0].desc).toMatch(/neutral spine/i)
    })

    it('puts all six into one routine with the targets from the cards', () => {
      expect(st.routines).toHaveLength(1)
      const r = st.routines[0]
      expect(r.id).toBe(PHYSIO_ROUTINE_ID)
      expect(r.ex.map(e => e.id)).toEqual(st.customEx.map(c => c.id))
      expect(byName('Double Leg Lift')).toMatchObject({ sets: 2, reps: 12 })
      expect(byName('Bilateral Hip IR AROM')).toMatchObject({ sets: 3, reps: 12 })
      expect(byName('Archer')).toMatchObject({ sets: 2, reps: 12 })
      expect(byName('Chin Tuck')).toMatchObject({ sets: 1, reps: 10 })
      expect(byName('Thoracic Extension (Opener)')).toMatchObject({ mode: 'time', sets: 2, sec: 45 })
      expect(byName('Supine Lying (Foam Roller)')).toMatchObject({ mode: 'time', sets: 1, sec: 60 })
    })

    it('times the two holds and counts reps for the rest, all without load', () => {
      const r = st.routines[0]
      expect(r.ex.map(e => modeOf(e))).toEqual(['reps', 'reps', 'time', 'reps', 'reps', 'time'])
      expect(r.ex.every(e => isBw(e) && e.weight === 0)).toBe(true)
    })

    it('notes the per-rep hold where the card has one', () => {
      expect(byName('Bilateral Hip IR AROM').note).toMatch(/2 s/)
      expect(byName('Chin Tuck').note).toMatch(/10 s/)
    })

    it('schedules the routine on all seven days with a 30 s rest', () => {
      expect(Object.keys(st.week).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6'])
      expect(Object.values(st.week).every(ids => ids.length === 1 && ids[0] === PHYSIO_ROUTINE_ID)).toBe(true)
      expect(st.restSec).toBe(30)
    })

    it('is deterministic — the same ids on every call, so a re-seed cannot duplicate', () => {
      expect(buildPhysioState()).toEqual(st)
    })
  })
  ```

- [ ] **Step 7: Run to see it fail.** `npx vitest run src/lib/physioSeed.test.js` — expected: FAIL, cannot resolve `./physioSeed.js`.

- [ ] **Step 8: Implement `physioSeed.js`.**

  A table of six rows drives everything. Ids are fixed (`cphysio1` … `cphysio6`), not `uid()`, so the output is deterministic. For each row build:

  - the custom exercise `{ id, n, bp, desc, tg, sm: [], muscleGroups: [tg], primaries: [tg], secondaries: [], eq: 'body weight', custom: true, media }`, where `media = { kind: 'image', hash, mime: 'image/webp', size, width, height, at: 0 }` from the manifest entry with the same `n`;
  - the routine entry `{ id, sets, reps, weight: 0, bodyweight: true }` for rep exercises, or `{ id, sets, mode: 'time', sec, weight: 0, bodyweight: true }` for timed ones, plus `note` where given.

  Before choosing `bp`, `tg` and `eq` values, read how `CustomExForm` in `frontend/src/sheets.jsx` (around lines 940–1010) and `frontend/src/lib/exercises.js` validate them, and use values that already occur in the built-in catalogue (`frontend/src/lib/exercises-data.js`) so the Library, picker and Muscles views treat the exercises like any other. Suggested mapping: 1 → waist/abs, 2 → upper legs/glutes, 3 → back/upper back, 4 → back/upper back, 5 → neck/levator scapulae, 6 → back/spine. Adjust to the catalogue's real spellings.

  Card data, copied from the cards:

  | n | name | sets | reps | sec | note | desc |
  |---|------|------|------|-----|------|------|
  | 1 | Double Leg Lift | 2 | 12 | – | – | Preparation: Lay on your back, knees bent, neutral spine position. Execution: Raise both legs as shown. Avoid changing the position of your back. Lower legs back down with control. |
  | 2 | Bilateral Hip IR AROM | 3 | 12 | – | Hold 2 s on each rep | Preparation: Sit tall. Squeeze a roll between knees. Execution: Swing both ankles away from each other. |
  | 3 | Thoracic Extension (Opener) | 2 | – | 45 | Hold 30–45 s | (empty: the card has pictures only) |
  | 4 | Archer | 2 | 12 | – | – | (empty: the card has pictures only) |
  | 5 | Chin Tuck | 1 | 10 | – | Hold 10 s on each rep | Preparation: Sit with good posture. Execution: Tuck chin gently (nod yes). |
  | 6 | Supine Lying (Foam Roller) | 1 | – | 60 | 30–60 s | Preparation: Lie on a foam roll as shown. Feet are flat on the floor. Execution: Lie in a comfortable position. You can try to let arms hang out to the side to get a stretch. |

  Return `{ customEx, routines: [{ id: PHYSIO_ROUTINE_ID, name: 'Daily physio', emoji: <an existing glyph key, see glyphOf in the codebase>, ex }], week: { 0: [id], … 6: [id] }, restSec: 30 }`.

- [ ] **Step 9: Run to see it pass.** `npx vitest run src/lib/physioSeed.test.js src/lib/physio.test.js` — expected: PASS.

- [ ] **Step 10: Commit.**

  ```bash
  git add frontend/src/lib/physio.js frontend/src/lib/physio.test.js frontend/src/lib/physioSeed.js frontend/src/lib/physioSeed.test.js frontend/src/lib/demo.js
  git commit -m "Physio: the build flag, session counting and the seeded exercises"
  ```

---

### Task 3: Boot, pictures in the media store, and no backend UI

**Files:**
- Create: `frontend/src/lib/physio-media.js`, `frontend/src/lib/physio-media.test.js`
- Modify: `frontend/src/store/useStore.js` (boot, near the `if (DEMO)` branch at ~line 1463; a new `seedPhysio` action beside `resetDemo` at ~line 1380)
- Modify: `frontend/src/views/Settings.jsx`, `frontend/src/views/Login.jsx`, `frontend/src/components/ServerSync.jsx`, `frontend/src/components/SyncBanner.jsx`
- Test: `frontend/src/store/useStore.physio.test.js`

**Interfaces:**
- Consumes: `PHYSIO`, `PHYSIO_SEEDED` (`physio.js`); `buildPhysioState()` (`physioSeed.js`); `NO_BACKEND` (`demo.js`); `mediaStore.get(hash)` and `mediaStore.put(hash, blob, { mime, pending })` (`lib/media-store.js`); `sha256Hex(bytes)` (`lib/sha256.js`); `appBase()` if asset URLs need it (`lib/app-base.js`).
- Produces: `restorePhysioMedia({ cards, store, fetchFn }) → Promise<{ restored, failed }>`; store action `seedPhysio() → Promise<boolean>` (true when it seeded).

- [ ] **Step 1: Write the failing tests for `physio-media.js`.** Use `createMediaStore(memoryBackend())` from `lib/media-store.js` as the store and a stub `fetchFn`. Read `media-store.test.js` first for how the existing tests construct one. Cases, each its own `it`:
  1. With an empty store and a `fetchFn` that returns the right bytes, every card ends up in the store under its manifest hash with `pending: false`, and the result is `{ restored: 6, failed: 0 }`.
  2. Cards already in the store are not fetched again (`fetchFn` not called) and the result is `{ restored: 0, failed: 0 }`.
  3. A `fetchFn` that rejects, or returns `ok: false`, for one card leaves the other five stored and returns `{ restored: 5, failed: 1 }` without throwing.
  4. Bytes whose sha256 differs from the manifest hash are not stored and count as failed.

  For the fixture, build two or three small `Blob`s in the test, compute their hashes with `sha256Hex`, and pass that as `cards` rather than the real manifest.

- [ ] **Step 2: Run to see it fail.** `npx vitest run src/lib/physio-media.test.js` — expected: FAIL, cannot resolve.

- [ ] **Step 3: Implement `physio-media.js`.**

  ```js
  // The card pictures of the physio build. A custom exercise can only show a picture that is in
  // the device's media store under its sha256 (media-refs.js), so the files that ship with the
  // app (public/physio/) are copied in — at the first boot, and again at any later one that
  // finds them gone: iOS may empty the store while localStorage, and so the exercises, survive.
  import manifest from './physio-cards.json'
  import { mediaStore } from './media-store.js'
  import { sha256Hex } from './sha256.js'

  export async function restorePhysioMedia({ cards = manifest, store = mediaStore, fetchFn = (...a) => fetch(...a) } = {}) {
    let restored = 0, failed = 0
    for (const c of cards) {
      try {
        if (await store.get(c.hash)) continue
        const res = await fetchFn(c.file)
        if (!res || !res.ok) throw new Error('physio-media: ' + c.file)
        const blob = await res.blob()
        if ((await sha256Hex(new Uint8Array(await blob.arrayBuffer()))) !== c.hash) throw new Error('physio-media: hash ' + c.file)
        await store.put(c.hash, new Blob([blob], { type: 'image/webp' }), { mime: 'image/webp', pending: false })
        restored++
      } catch { failed++ }
    }
    return { restored, failed }
  }
  ```

  Check `sha256Hex`'s accepted argument type in `lib/sha256.js` and how `backup-media.js:129` calls it; adapt the call if it differs. `c.file` is relative (`physio/1.webp`) because Vite's `base` is `'./'`; confirm how the app builds other asset URLs (`lib/app-base.js`) and follow that if a relative fetch would break under a nested route.

- [ ] **Step 4: Run to see it pass.** `npx vitest run src/lib/physio-media.test.js` — expected: PASS.

- [ ] **Step 5: Write the failing store tests** (`useStore.physio.test.js`, `// @vitest-environment happy-dom`). Read `frontend/src/store/` and an existing store test for how `useStore`, `persist` and `localStorage` are set up and reset between tests. Cases:
  1. `seedPhysio()` on an empty profile: state gains six `customEx`, one routine with id `physio-daily`, seven `week` entries, `restSec === 30`; returns `true`.
  2. `seedPhysio()` when the profile already has a workout, a routine, a weigh-in or a custom exercise: state is unchanged; returns `false`.
  3. `seedPhysio()` twice on an empty profile: still six exercises and one routine.

- [ ] **Step 6: Implement `seedPhysio` and the boot branch** in `useStore.js`.

  Beside `resetDemo`:

  ```js
  // Physio build only: the six exercises and their daily routine, once, and never over a
  // profile that already holds something (hasData) — this is a real history, not a demo.
  async seedPhysio() {
    if (hasData(get().S)) return false
    const { buildPhysioState } = await import('../lib/physioSeed.js')
    markOwed(false)
    persist(Object.assign(clone(get().S), buildPhysioState()), false)
    return true
  },
  ```

  Read how `resetDemo` and `persist` work before writing this and match them; if `persist` does not call `registerCustom`, call it with the new `customEx` so the exercises resolve at once.

  In `boot()`, directly above the `if (DEMO)` branch:

  ```js
  // Physio build (GitHub Pages): no backend — seed once, stay in guest mode. The pictures are
  // checked at every boot, not only the first: see lib/physio-media.js.
  if (PHYSIO) {
    if (!localStorage.getItem(PHYSIO_SEEDED)) {
      localStorage.setItem(PHYSIO_SEEDED, '1')
      await get().seedPhysio()
    }
    get().setGuest(true)
    finishBoot()
    import('../lib/physio-media.js').then(m => m.restorePhysioMedia()).catch(() => {})
    return
  }
  ```

  Add `import { PHYSIO, PHYSIO_SEEDED } from '../lib/physio.js'`. The media restore is not awaited, so a slow or failed fetch never holds the app at the splash screen.

- [ ] **Step 7: Run the store tests.** `npx vitest run src/store/useStore.physio.test.js` — expected: PASS.

- [ ] **Step 8: Hide backend-only UI.** Replace `DEMO` with `NO_BACKEND` only where the check means "there is no server":
  - `components/ServerSync.jsx:294` and `components/SyncBanner.jsx:44`.
  - `views/Settings.jsx`: lines 47, 281, 327, 511. At 290–299 the demo shows a "Demo" section with "Reset demo data"; in the physio build show the same section as upstream's guest/account branch would, minus sign-in — title `t('Your data')`, containing the existing export and import backup rows and nothing that needs a server. Read the whole section first and reuse its existing rows; do not write new export code.
  - `views/Login.jsx:85`: the physio build must never show the login screen. Boot already puts it in guest mode; make the `DEMO` early-return also cover `PHYSIO` only if the demo screen it returns is appropriate, otherwise redirect to `/home`.
  - Leave every `DEMO` check in `lib/coach-api.js`, `views/Coach*.jsx` and `views/Plan.jsx` alone: with `demo: false` and no server config the Coach is simply unavailable, which is what the physio build wants. Verify that by reading `coachAvailable`.

- [ ] **Step 9: Run the full suite.** `npm test` — expected: all pass, no new failures against `main` (run `git stash; npm test; git stash pop` once first if the baseline is unknown, and note any pre-existing failures).

- [ ] **Step 10: Commit.**

  ```bash
  git add frontend/src
  git commit -m "Physio: seed at first boot, keep the card pictures in the media store, hide what needs a server"
  ```

---

### Task 4: Today row counts two sessions

**Files:**
- Modify: `frontend/src/views/Home.jsx:44-100`
- Test: `frontend/src/views/Home.physio.test.jsx`

**Interfaces:**
- Consumes: `PHYSIO`, `sessionProgress(S, iso) → { done, target, complete }` from `lib/physio.js`.
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the failing test.** Copy the harness of `frontend/src/views/Home.startdoor.test.jsx` (mocks of `react-router-dom` and `../sheets.jsx`, `setS`, `mount`). Mock the flag on:

  ```js
  vi.mock('../lib/physio.js', async orig => ({ ...(await orig()), PHYSIO: true }))
  ```

  `todayISO` comes from `lib/format.js`; import it to build workouts for today. Cases:
  1. No workouts today: the row shows the routine name and a `Start` tag; clicking it calls `startFlow`.
  2. One workout today: the row text contains `1 of 2 done`, still shows `Start`, and clicking it calls `startFlow`.
  3. Two workouts today: the row text contains `2 of 2 done` and shows `Done`, not `Start`.
  4. Three workouts today: still `2 of 2 done`.
  5. A session in progress (`active` set) with one done: the row shows the in-progress state as upstream does (assert `Resume`).

  Add one test in a second file or `describe` with the flag off (no mock, or `PHYSIO: false`): one workout today shows upstream's `— done` text and `Done` tag, proving the default build is untouched.

- [ ] **Step 2: Run to see it fail.** `npx vitest run src/views/Home.physio.test.jsx` — expected: FAIL on cases 2–4.

- [ ] **Step 3: Implement.** In `Home.jsx`, after `doneToday`:

  ```js
  // Physio build: the day is two sessions, not one. Until both are logged the row keeps
  // offering the next one instead of reporting the day as done.
  const prog = PHYSIO ? sessionProgress(S, todayISO()) : null
  const dayDone = prog ? prog.complete : !!doneToday
  ```

  Then in the Today row use `dayDone` wherever `doneToday` currently decides icon, colour and tag, so one session of two renders as "not done yet"; and for the title, when `prog && prog.done > 0 && !S.active`, show `t('{0} of {1} done', prog.done, prog.target)`. Keep `S.active` winning over everything, as it does now. The `next &&` "Next session" line stays keyed on `dayDone`. Do not change the week strip.

  Check how `t()` formats placeholders (`{0}`) and whether new strings must be registered in `frontend/src/locales/` or a source-string check (`scripts/check-source-strings.mjs`); follow what the repo requires for a new English string.

- [ ] **Step 4: Run to see it pass.** `npx vitest run src/views/Home.physio.test.jsx src/views/Home.startdoor.test.jsx src/views/Home.weight-card.test.jsx` — expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/views/Home.jsx frontend/src/views/Home.physio.test.jsx frontend/src/locales
  git commit -m "Physio: Home counts today's two sessions"
  ```

---

### Task 5: Build and deploy configuration

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `frontend/public/sw.js` only if Step 3 shows the pictures are not cached for offline use

**Interfaces:**
- Consumes: everything above.
- Produces: `frontend/dist/` that runs as the physio app from any static host.

- [ ] **Step 1: Switch the workflow.** In `pages.yml` replace `VITE_DEMO: '1'` with `VITE_PHYSIO: '1'`, keep `VITE_IMG_BASE` and `VITE_GIF_BASE`, and rewrite the header comment to describe this fork: it publishes the physio build, not the demo. Remove the two upstream URLs from the comment.

- [ ] **Step 2: Build locally.**

  Run: `VITE_PHYSIO=1 npm run build`
  Expected: build succeeds; `ls dist/physio` lists six `.webp` files.

- [ ] **Step 3: Check offline caching.** Read `frontend/public/sw.js`: find what `precache()` and the fetch handler cache. The pictures are copied into the media store at first boot, so the app does not need `physio/*.webp` again afterwards; confirm the handler does not break the first-boot fetch (for example by answering from a cache that lacks them). Change `sw.js` only if it does.

- [ ] **Step 4: Check the demo flag is off in this bundle.**

  Run: `grep -l "Reset demo data" dist/assets/*.js | wc -l`
  Expected: `0` if the string is tree-shaken; if it is `1`, confirm in `Settings.jsx` that the row is unreachable when `DEMO` is false and say so in the report.

- [ ] **Step 5: Run the full suite once more.** `npm test` — expected: all pass.

- [ ] **Step 6: Commit.**

  ```bash
  git add .github/workflows/pages.yml frontend/public/sw.js
  git commit -m "Pages: publish the physio build"
  ```

---

## After the tasks

Manual test at iPhone viewport size against `npx vite preview` of the physio build: first boot seeds, pictures show, a full session runs with the hold timer, Home goes 0 → 1 of 2 → 2 of 2, History lists both, reload keeps everything, and clearing the media store brings the pictures back on reload. Deployment (fork, push, enable Pages) happens only after the user confirms.
