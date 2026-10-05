// @vitest-environment happy-dom
// The physio build (VITE_PHYSIO=1) does its exercises twice a day, so one logged session is half
// the day, not all of it. Home's Today row counts to two there and keeps offering the next
// session until both are in. Every other build reports the day done after one, as upstream does.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { startFlow } from '../sheets.jsx'
import { todayISO } from '../lib/format.js'
import Home from './Home.jsx'

// Home reads the flag as it renders, so one switch serves both builds in this file.
const flag = vi.hoisted(() => ({ physio: true }))
vi.mock('../lib/physio.js', async orig => ({ ...(await orig()), get PHYSIO() { return flag.physio } }))

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

const routines = [{ id: 'r1', name: 'Mobility', emoji: null, ex: [{ id: '0025' }] }]
// `n` sessions of the routine, all logged today.
const today = n => Array.from({ length: n }, (_, i) => ({ id: 'w' + i, d: todayISO(), name: 'Mobility', entries: [] }))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  flag.physio = true
  nav.mockClear(); startFlow.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

// Every weekday points at the routine and the weigh-in is off: today is always planned.
const setS = (over = {}) => useStore.setState(s => ({
  S: {
    ...s.S, routines, dayPlan: {}, workouts: [], active: null, weighIn: false,
    week: { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] }, ...over,
  },
  user: null,
}))
const mount = () => act(() => root.render(<Home />))
const row = () => host.querySelector('.today-row')
const title = () => row().querySelector('.ttl').textContent
const tag = () => row().querySelector('.tag')?.textContent
const tap = () => act(() => { row().dispatchEvent(new MouseEvent('click', { bubbles: true })) })

describe('Home — the physio build counts two sessions a day', () => {
  it('offers the routine before the first session', () => {
    setS(); mount()
    expect(title()).toBe('Mobility')
    expect(tag()).toBe('Start')
    tap()
    expect(startFlow).toHaveBeenCalledWith(['r1'])
  })

  it('after one session it counts 1 of 2 and still offers the second', () => {
    setS({ workouts: today(1) }); mount()
    expect(row().textContent).toContain('1 of 2 done')
    expect(tag()).toBe('Start')
    tap()
    expect(startFlow).toHaveBeenCalledWith(['r1'])
  })

  it('after two sessions the day is done', () => {
    setS({ workouts: today(2) }); mount()
    expect(row().textContent).toContain('2 of 2 done')
    expect(tag()).toBe('Done')
  })

  it('a third session still reads 2 of 2', () => {
    setS({ workouts: today(3) }); mount()
    expect(row().textContent).toContain('2 of 2 done')
    expect(tag()).toBe('Done')
  })

  it('a session in progress still wins over the count', () => {
    setS({ workouts: today(1), active: { id: 'a', name: 'Mobility', start: Date.now(), cur: 0, entries: [] } })
    mount()
    expect(title()).toBe('Mobility — in progress')
    expect(tag()).toBe('Resume')
  })
})

describe('Home — every other build reports the day done after one session', () => {
  it('one session today reads as done, as upstream', () => {
    flag.physio = false
    setS({ workouts: today(1) }); mount()
    expect(title()).toBe('Mobility — done')
    expect(tag()).toBe('Done')
  })
})
