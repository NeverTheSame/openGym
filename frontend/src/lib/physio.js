// Physio build (VITE_PHYSIO=1): openGym with no backend, seeded with six physiotherapy
// exercises that are done twice a day. Like the demo build (demo.js) it stays in guest mode
// with everything in localStorage; unlike it, the profile is real and nothing resets it but
// Settings → Reset everything, which seeds the six exercises again.
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
