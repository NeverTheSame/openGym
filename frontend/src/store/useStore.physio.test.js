// @vitest-environment happy-dom

/* The physio build's boot (VITE_PHYSIO=1): the six exercises and their routine are seeded once,
   never over a profile that already holds something, and the card pictures are copied into the
   media store at every boot that finds them missing — a fetch that fails costs nothing but the
   picture, until the next boot gets it. Each boot is a fresh import of the store
   (vi.resetModules), loading what the last one left in localStorage, as a page load does; the
   media store is the in-memory one, handed to that fresh copy. No request reaches the API. */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import cards from '../lib/physio-cards.json'

const h = vi.hoisted(() => ({ api: null }))
vi.mock('../lib/api.js', () => ({ api: (...a) => h.api(...a), setRemoteAuth: () => {} }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: () => {} }) } }))
vi.mock('../lib/physio.js', async orig => ({ ...(await orig()), PHYSIO: true }))
// The seed's own chunk failing to load, as any chunk can (the signal lost between the app and it).
const SEED = '../lib/physioSeed.js'
const seedChunkFails = () => vi.doMock(SEED, () => { throw new TypeError('Failed to fetch dynamically imported module') })
const seedChunkLoads = () => vi.doUnmock(SEED)

const clone = v => JSON.parse(JSON.stringify(v))
const KEY = 'gym_state_v1'
const SEEDED = 'gym_physio_seeded_v1'
const saved = () => JSON.parse(localStorage.getItem(KEY))

// The pictures as the build ships them, served by path the way the page's fetch would get them.
const FILES = Object.fromEntries(cards.map(c => [c.file, readFileSync(new URL('../../public/' + c.file, import.meta.url))]))
const serve = () => vi.fn(async file => ({ ok: true, status: 200, blob: async () => new Blob([FILES[file]]) }))
const offline = () => vi.fn(async () => { throw new TypeError('Failed to fetch') })

// A page load: a fresh store over this localStorage, with `media` as the device's media store.
async function load(media) {
  vi.resetModules()
  const ms = await import('../lib/media-store.js')
  media = media || ms.createMediaStore(ms.memoryBackend())
  ms._setMediaStore(media)
  const { useStore, DEF } = await import('./useStore.js')
  return { useStore, DEF, media }
}
async function boot(media, fetchFn) {
  vi.stubGlobal('fetch', fetchFn)
  const page = await load(media)
  await page.useStore.getState().boot()
  return page
}
const stored = async media => (await media.list()).map(r => r.hash).sort()
const allCards = cards.map(c => c.hash).sort()
// Boot does not wait for the pictures; a test does, so none of its fetches outlives it.
const fetchedAll = fetchFn => vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(6))
// The same for a boot over a store that holds them all, which fetches nothing: its six look-ups.
// A restore still loading when the test ends would land in the next test's fresh modules.
const lookups = media => { const get = vi.spyOn(media, 'get'); return () => vi.waitFor(() => expect(get).toHaveBeenCalledTimes(6)) }

beforeEach(() => {
  localStorage.clear()
  h.api = vi.fn(async path => { throw new Error('no API in the physio build: ' + path) })
})
afterEach(() => {
  seedChunkLoads()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('seedPhysio', () => {
  it('fills an empty profile with the six exercises, their routine on every day, 30 s rest and no weigh-in', async () => {
    const { useStore } = await load()
    expect(await useStore.getState().seedPhysio()).toBe(true)
    const S = useStore.getState().S
    expect(S.customEx.map(c => c.id)).toEqual(['cphysio1', 'cphysio2', 'cphysio3', 'cphysio4', 'cphysio5', 'cphysio6'])
    expect(S.routines.map(r => r.id)).toEqual(['physio-daily'])
    expect(Object.keys(S.week)).toHaveLength(7)
    expect(Object.values(S.week).every(d => d.length === 1 && d[0] === 'physio-daily')).toBe(true)
    expect(S.restSec).toBe(30)
    expect(S.weighIn).toBe(false)
    expect(saved().customEx).toHaveLength(6)   // on the device, not only in memory
  })

  it.each([
    ['a workout', { workouts: [{ id: 'w1', d: '2026-09-01', start: 1, entries: [] }] }],
    ['a routine', { routines: [{ id: 'r1', name: 'Mine', ex: [] }] }],
    ['a weigh-in', { bodyweight: [{ d: '2026-09-01', w: 80 }] }],
    ['a custom exercise', { customEx: [{ id: 'c1', n: 'Mine', bp: 'back', custom: true }] }],
  ])('leaves a profile holding %s exactly as it was', async (_, own) => {
    const { useStore, DEF } = await load()
    const S = { ...clone(DEF), ...own, _ts: 5 }
    useStore.setState({ S })
    expect(await useStore.getState().seedPhysio()).toBe(false)
    expect(useStore.getState().S).toBe(S)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('run twice, one after the other or at once, still holds one copy of each', async () => {
    const { useStore } = await load()
    expect(await useStore.getState().seedPhysio()).toBe(true)
    expect(await useStore.getState().seedPhysio()).toBe(false)
    expect(useStore.getState().S.customEx).toHaveLength(6)
    expect(useStore.getState().S.routines).toHaveLength(1)

    localStorage.clear()
    const again = await load()
    expect(await Promise.all([again.useStore.getState().seedPhysio(), again.useStore.getState().seedPhysio()])).toEqual([true, false])
    expect(again.useStore.getState().S.customEx).toHaveLength(6)
    expect(again.useStore.getState().S.routines).toHaveLength(1)
  })
})

describe('boot in the physio build', () => {
  it('seeds once, opens as a guest, and puts the six pictures into the media store', async () => {
    const fetchFn = serve()
    const { useStore, media } = await boot(null, fetchFn)
    expect(useStore.getState().ready).toBe(true)
    expect(useStore.getState().isGuest()).toBe(true)
    expect(useStore.getState().S.customEx).toHaveLength(6)
    expect(localStorage.getItem(SEEDED)).toBe('1')
    await vi.waitFor(async () => expect(await stored(media)).toEqual(allCards))
    // Each picture is the one its exercise names, and nothing waits for a server.
    expect(useStore.getState().S.customEx.map(c => c.media.hash).sort()).toEqual(allCards)
    expect(media.pendingNow().size).toBe(0)
    expect(fetchFn.mock.calls.map(c => c[0])).toEqual(cards.map(c => c.file))
    expect(h.api).not.toHaveBeenCalled()
  })

  it('never seeds over a profile that already holds data, on this boot or a later one', async () => {
    const mine = { workouts: [{ id: 'w1', d: '2026-09-01', start: 1, entries: [] }], routines: [{ id: 'r1', name: 'Mine', ex: [] }], _ts: 7 }
    localStorage.setItem(KEY, JSON.stringify(mine))
    const one = serve()
    const first = await boot(null, one)
    expect(first.useStore.getState().S.customEx).toEqual([])
    expect(first.useStore.getState().S.routines.map(r => r.id)).toEqual(['r1'])
    expect(saved()).toEqual(mine)
    expect(localStorage.getItem(SEEDED)).toBe('1')
    expect(first.useStore.getState().ready).toBe(true)
    await fetchedAll(one)

    // Emptied since by hand, entry by entry: the question was answered, it is not asked again.
    localStorage.setItem(KEY, JSON.stringify({ _ts: 8 }))
    const two = serve()
    const later = await boot(null, two)
    expect(later.useStore.getState().S.customEx || []).toEqual([])
    expect(later.useStore.getState().S.routines || []).toEqual([])
    await fetchedAll(two)
    expect(h.api).not.toHaveBeenCalled()
  })

  it('a later boot that finds the media store emptied puts the pictures back, and adds no exercises', async () => {
    const first = await boot(null, serve())
    await vi.waitFor(async () => expect(await stored(first.media)).toEqual(allCards))
    const S = saved()

    // iOS cleared the site's storage but kept localStorage: a new, empty store.
    const fetchFn = serve()
    const later = await boot(null, fetchFn)
    await vi.waitFor(async () => expect(await stored(later.media)).toEqual(allCards))
    expect(fetchFn).toHaveBeenCalledTimes(6)
    expect(later.useStore.getState().S.customEx).toHaveLength(6)
    expect(later.useStore.getState().S.routines).toHaveLength(1)
    expect(saved()).toEqual(S)

    // And one that finds them all there fetches nothing.
    const looked = vi.spyOn(later.media, 'get')
    const quiet = serve()
    const third = await boot(later.media, quiet)
    expect(third.useStore.getState().ready).toBe(true)
    await vi.waitFor(() => expect(looked).toHaveBeenCalledTimes(6))
    expect(quiet).not.toHaveBeenCalled()
    expect(await stored(later.media)).toEqual(allCards)
  })

  it('a failed picture fetch still seeds and opens the app, and the next boot gets the pictures', async () => {
    const down = offline()
    const first = await boot(null, down)
    expect(first.useStore.getState().ready).toBe(true)
    expect(first.useStore.getState().isGuest()).toBe(true)
    expect(first.useStore.getState().S.customEx).toHaveLength(6)
    expect(first.useStore.getState().S.routines).toHaveLength(1)
    await vi.waitFor(() => expect(down).toHaveBeenCalledTimes(6))
    expect(await stored(first.media)).toEqual([])

    const later = await boot(first.media, serve())
    await vi.waitFor(async () => expect(await stored(first.media)).toEqual(allCards))
    expect(later.useStore.getState().S.customEx).toHaveLength(6)
    expect(h.api).not.toHaveBeenCalled()
  })

  it('a picture fetch that never answers does not hold the app at the splash screen', async () => {
    const hung = vi.fn(() => new Promise(() => {}))
    const { useStore } = await boot(null, hung)
    expect(useStore.getState().ready).toBe(true)
    expect(useStore.getState().S.customEx).toHaveLength(6)
    await vi.waitFor(() => expect(hung).toHaveBeenCalledTimes(1))
  })

  it('a seed whose chunk fails to load still opens the app, and the next boot seeds', async () => {
    seedChunkFails()
    const first = await boot(null, serve())
    expect(first.useStore.getState().ready).toBe(true)
    expect(first.useStore.getState().isGuest()).toBe(true)
    expect(first.useStore.getState().S.customEx || []).toEqual([])
    expect(localStorage.getItem(SEEDED)).toBeNull()
    await vi.waitFor(async () => expect(await stored(first.media)).toEqual(allCards))

    seedChunkLoads()
    const done = lookups(first.media)
    const later = await boot(first.media, serve())
    expect(later.useStore.getState().S.customEx).toHaveLength(6)
    expect(later.useStore.getState().S.routines.map(r => r.id)).toEqual(['physio-daily'])
    expect(localStorage.getItem(SEEDED)).toBe('1')
    expect(h.api).not.toHaveBeenCalled()
    await done()
  })
})

describe('Reset everything in the physio build', () => {
  it('takes the history and brings the six exercises and their routine straight back', async () => {
    const first = await boot(null, serve())
    await vi.waitFor(async () => expect(await stored(first.media)).toEqual(allCards))
    const { useStore } = first
    useStore.getState().update(s => { s.workouts.push({ id: 'w1', d: '2026-09-01', start: 1, entries: [] }); s.restSec = 45 })
    await useStore.getState().resetEverything()
    const S = useStore.getState().S
    expect(S.workouts).toEqual([])
    expect(S.resetAt).toBeGreaterThan(0)
    expect(S.customEx.map(c => c.id)).toEqual(['cphysio1', 'cphysio2', 'cphysio3', 'cphysio4', 'cphysio5', 'cphysio6'])
    expect(S.routines.map(r => r.id)).toEqual(['physio-daily'])
    expect(Object.keys(S.week)).toHaveLength(7)
    expect(S.restSec).toBe(30)
    expect(saved().customEx).toHaveLength(6)
    expect(localStorage.getItem(SEEDED)).toBe('1')

    // A later boot neither seeds a second copy nor loses this one.
    const done = lookups(first.media)
    const later = await boot(first.media, serve())
    expect(later.useStore.getState().S.customEx).toHaveLength(6)
    expect(later.useStore.getState().S.routines).toHaveLength(1)
    expect(later.useStore.getState().S.workouts).toEqual([])
    expect(h.api).not.toHaveBeenCalled()
    await done()
  })

  it('one whose seed fails to load leaves the next boot to seed', async () => {
    // Answered on an earlier visit, for a profile of its own: this page load does not load the
    // seed's chunk before the reset asks for it.
    localStorage.setItem(KEY, JSON.stringify({ customEx: [{ id: 'c1', n: 'Mine', bp: 'back', custom: true }], _ts: 3 }))
    localStorage.setItem(SEEDED, '1')
    const first = await boot(null, serve())
    const { media } = first
    await vi.waitFor(async () => expect(await stored(media)).toEqual(allCards))
    seedChunkFails()
    await first.useStore.getState().resetEverything()
    expect(first.useStore.getState().S.customEx).toEqual([])
    expect(localStorage.getItem(SEEDED)).toBeNull()

    seedChunkLoads()
    const done = lookups(media)
    const later = await boot(media, serve())
    expect(later.useStore.getState().S.customEx).toHaveLength(6)
    expect(later.useStore.getState().S.routines).toHaveLength(1)
    expect(localStorage.getItem(SEEDED)).toBe('1')
    await done()
  })
})
