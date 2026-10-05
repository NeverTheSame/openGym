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
