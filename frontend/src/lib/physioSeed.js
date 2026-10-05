// The profile behind the physio build (see physio.js): six custom exercises copied from the
// physiotherapist's cards, one routine holding them, and that routine on every day of the week.
// Imported dynamically, so it stays out of the bundle self-hosters ship.
//
// Ids are fixed rather than uid(): the output is the same on every call, so seeding twice
// replaces the exercises instead of adding a second copy of each.
import manifest from './physio-cards.json'

export const PHYSIO_ROUTINE_ID = 'physio-daily'

// One row per card, in card order. `n` is the card's number in the manifest. `bp`, `tg` and `eq`
// are spellings the built-in catalogue uses (exercises-data.js), so the Library and the picker
// file these with the catalogue's own; `muscle` is what `tg` stands for on the body map
// (muscles.js ALIAS), the name CustomExForm stores in `primaries` and a shared plan keeps.
// `sec` makes the exercise a timed hold; `note` is the per-rep hold openGym has no timer for.
const CARDS = [
  { n: 1, name: 'Double Leg Lift', bp: 'waist', tg: 'abs', muscle: 'abs', sets: 2, reps: 12,
    desc: 'Preparation: Lay on your back, knees bent, neutral spine position. Execution: Raise both legs as shown. Avoid changing the position of your back. Lower legs back down with control.' },
  { n: 2, name: 'Bilateral Hip IR AROM', bp: 'upper legs', tg: 'glutes', muscle: 'gluteal', sets: 3, reps: 12, note: 'Hold 2 s on each rep',
    desc: 'Preparation: Sit tall. Squeeze a roll between knees. Execution: Swing both ankles away from each other.' },
  { n: 3, name: 'Thoracic Extension (Opener)', bp: 'back', tg: 'upper back', muscle: 'upper-back', sets: 2, sec: 45, note: 'Hold 30–45 s',
    desc: '' },
  { n: 4, name: 'Archer', bp: 'back', tg: 'upper back', muscle: 'upper-back', sets: 2, reps: 12,
    desc: '' },
  { n: 5, name: 'Chin Tuck', bp: 'neck', tg: 'levator scapulae', muscle: 'trapezius', sets: 1, reps: 10, note: 'Hold 10 s on each rep',
    desc: 'Preparation: Sit with good posture. Execution: Tuck chin gently (nod yes).' },
  { n: 6, name: 'Supine Lying (Foam Roller)', bp: 'back', tg: 'spine', muscle: 'lower-back', sets: 1, sec: 60, note: '30–60 s',
    desc: 'Preparation: Lie on a foam roll as shown. Feet are flat on the floor. Execution: Lie in a comfortable position. You can try to let arms hang out to the side to get a stretch.' }
]

/** The seeded part of the state: { customEx, routines, week, restSec, weighIn }, ready to merge over it. */
export function buildPhysioState(cards = manifest) {
  const customEx = []
  const ex = []
  for (const c of CARDS) {
    const id = 'cphysio' + c.n
    // The picture is the card itself, put in the media store under this hash at first boot. It is
    // its own poster too: a list thumbnail shows only the poster (CustomMedia.jsx CustomThumb).
    const card = cards.find(x => x.n === c.n)
    const file = card && { hash: card.hash, mime: 'image/webp', size: card.size, width: card.width, height: card.height }
    const media = card && { kind: 'image', ...file, poster: file, at: 0 }
    customEx.push({
      id, n: c.name, bp: c.bp, desc: c.desc, tg: c.tg, sm: [], muscleGroups: [c.muscle], primaries: [c.muscle], secondaries: [],
      eq: 'body weight', custom: true, ...(media ? { media } : {})
    })
    const target = c.sec ? { mode: 'time', sec: c.sec } : { reps: c.reps }
    ex.push({ id, sets: c.sets, ...target, weight: 0, bodyweight: true, ...(c.note ? { note: c.note } : {}) })
  }
  const week = {}
  for (let d = 0; d < 7; d++) week[d] = [PHYSIO_ROUTINE_ID]
  return {
    customEx,
    // A prescription, not a program: progression off, or every clean session adds a rep
    // (progression.js policyFor defaults rep work to 'linear').
    routines: [{ id: PHYSIO_ROUTINE_ID, name: 'Daily physio', emoji: 'stretch', prog: 'off', ex }],
    week,
    restSec: 30,
    // Twice a day, a body-weight check-in before each session is a question too many.
    weighIn: false
  }
}
