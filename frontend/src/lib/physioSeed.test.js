import { afterAll, describe, expect, it } from 'vitest'
import { buildPhysioState, PHYSIO_ROUTINE_ID } from './physioSeed.js'
import { normalizeMediaRef, referencedFiles } from './media-refs.js'
import { modeOf, isBw } from './history.js'
import { EXDB, BODYPARTS, registerCustom } from './exercises.js'
import { MUSCLES, muscleGroupsOf } from './muscles.js'
import { buildCombinedEntries } from './session-merge.js'
import { buildCompletedWorkout } from './finish-workout.js'
import { progressionGuidance } from './progression-copy.js'
import { isWarmupRow } from './workout-model.js'
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
      // The list thumbnail shows only a poster (CustomThumb): the card is its own.
      expect(normalizeMediaRef(c.media).poster.hash).toBe(cards[i].hash)
    })
    // One file each, not a picture and a poster.
    expect(referencedFiles(st).map(f => f.hash)).toEqual(cards.map(c => c.hash))
  })

  it('carries the card text', () => {
    expect(st.customEx[0].desc).toMatch(/neutral spine/i)
  })

  // Body part, target and equipment are the catalogue's own spellings, so the Library and the
  // picker file them with the built-in exercises; the muscle lists hold the map's names, the
  // only ones CustomExForm offers and a shared plan file keeps (plan-share.js cleanCustom).
  it('files each exercise under catalogue values and the muscle its target stands for', () => {
    st.customEx.forEach(c => {
      expect(EXDB.some(e => e.bp === c.bp && e.tg === c.tg)).toBe(true)
      expect(BODYPARTS).toContain(c.bp)
      expect(EXDB.some(e => e.eq === c.eq)).toBe(true)
      expect(MUSCLES).toEqual(expect.arrayContaining(c.primaries))
      expect(muscleGroupsOf({ tg: c.tg })).toEqual(c.primaries)
      expect(muscleGroupsOf(c)).toEqual(c.primaries)
    })
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

  it('schedules the routine on all seven days with a 30 s rest and no weigh-in before it', () => {
    expect(Object.keys(st.week).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6'])
    expect(Object.values(st.week).every(ids => ids.length === 1 && ids[0] === PHYSIO_ROUTINE_ID)).toBe(true)
    expect(st.restSec).toBe(30)
    expect(st.weighIn).toBe(false)
  })

  it('is deterministic — the same ids on every call, so a re-seed cannot duplicate', () => {
    expect(buildPhysioState()).toEqual(st)
  })
})

// A prescription stays as the cards give it: a clean session is not a reason to add a rep. Each
// session starts the way beginWorkout starts one (buildCombinedEntries) and is saved the way the
// finish path saves it (buildCompletedWorkout), every row ticked as it opened.
describe('the seeded routine, trained twice a day', () => {
  afterAll(() => registerCustom([]))

  it('opens every session at the targets on the cards, however many clean ones came before', () => {
    const seeded = buildPhysioState()
    registerCustom(seeded.customEx)   // as the store does with a loaded profile
    const st = { unit: 'kg', exWeights: {}, workouts: [], dayPlan: {}, ...seeded }
    // Per exercise, in card order: one value per set — reps, or seconds for the two holds.
    const card = [[12, 12], [12, 12, 12], [45, 45], [12, 12], [10], [60]]
    const work = e => e.sets.filter(s => !isWarmupRow(s))
    const rows = [], targets = [], lines = []
    for (let n = 0; n < 6; n++) {
      const { entries } = buildCombinedEntries(st, [PHYSIO_ROUTINE_ID])
      rows.push(entries.map(e => work(e).map(s => (modeOf(e.target) === 'time' ? s.sec : s.r))))
      targets.push(entries.map(e => e.target.sec || e.target.reps))
      lines.push(entries.map(e => progressionGuidance(e.plan)))
      const done = entries.map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, done: true })) }))
      const start = (n + 1) * 1000
      const active = { id: 'w' + n, d: `2026-10-0${1 + (n >> 1)}`, start, routineIds: [PHYSIO_ROUTINE_ID], name: 'Daily physio', entries: done }
      st.workouts.push(buildCompletedWorkout(active, { end: start + 1 }))
    }
    expect(rows).toEqual(Array(6).fill(card))
    expect(targets).toEqual(Array(6).fill(card.map(c => c[0])))
    // Nothing to explain either: the workout shows no progression line for these.
    expect(lines.flat()).toEqual(Array(36).fill(null))
  })
})
