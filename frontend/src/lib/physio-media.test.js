import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { restorePhysioMedia } from './physio-media.js'
import { createMediaStore, memoryBackend } from './media-store.js'
import { sha256Hex } from './sha256.js'

// Six small files standing in for the cards, with a manifest of the same shape as
// physio-cards.json: the counts below are the real build's, the bytes are not.
const BYTES = [1, 2, 3, 4, 5, 6].map(n => new TextEncoder().encode('card ' + n))
let cards
beforeAll(async () => {
  cards = await Promise.all(BYTES.map(async (b, i) => ({ n: i + 1, file: `physio/${i + 1}.webp`, hash: await sha256Hex(b), size: b.length, width: 8, height: 5 })))
})

// What fetch answers for each file: its bytes, unless `broken` says otherwise for that file.
const serve = (broken = {}) => vi.fn(async file => {
  if (broken[file] === 'reject') throw new TypeError('Failed to fetch')
  if (broken[file] === 'not ok') return { ok: false, status: 404, blob: async () => new Blob(['Not Found']) }
  const i = cards.findIndex(c => c.file === file)
  const bytes = broken[file] === 'other bytes' ? new TextEncoder().encode('not the card') : BYTES[i]
  return { ok: true, status: 200, blob: async () => new Blob([bytes]) }
})

describe('restorePhysioMedia', () => {
  let store
  beforeEach(() => { store = createMediaStore(memoryBackend()) })

  it('puts every card into an empty store under its manifest hash, as already synced', async () => {
    const fetchFn = serve()
    expect(await restorePhysioMedia({ cards, store, fetchFn })).toEqual({ restored: 6, failed: 0 })
    expect(fetchFn.mock.calls.map(c => c[0])).toEqual(cards.map(c => c.file))
    for (const c of cards) {
      const rec = await store.get(c.hash)
      expect(rec).toMatchObject({ mime: 'image/webp', size: c.size, pending: false })
      expect(await sha256Hex(rec.blob)).toBe(c.hash)
    }
    expect(store.pendingNow().size).toBe(0)
  })

  it('does not fetch a card the store already holds', async () => {
    for (const [i, c] of cards.entries()) await store.put(c.hash, new Blob([BYTES[i]]), { mime: 'image/webp', pending: false })
    const fetchFn = serve()
    expect(await restorePhysioMedia({ cards, store, fetchFn })).toEqual({ restored: 0, failed: 0 })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('stores the other five when one fetch is refused, without throwing', async () => {
    const fetchFn = serve({ 'physio/3.webp': 'reject' })
    expect(await restorePhysioMedia({ cards, store, fetchFn })).toEqual({ restored: 5, failed: 1 })
    expect(await store.has(cards[2].hash)).toBe(false)
    expect((await store.list()).map(r => r.hash).sort()).toEqual(cards.filter(c => c.n !== 3).map(c => c.hash).sort())
  })

  it('stores the other five when one file answers with an error status', async () => {
    const fetchFn = serve({ 'physio/6.webp': 'not ok' })
    expect(await restorePhysioMedia({ cards, store, fetchFn })).toEqual({ restored: 5, failed: 1 })
    expect(await store.has(cards[5].hash)).toBe(false)
    expect(await store.usage()).toMatchObject({ count: 5 })
  })

  it('keeps nothing whose bytes do not hash to the manifest, and counts it failed', async () => {
    const fetchFn = serve({ 'physio/1.webp': 'other bytes' })
    expect(await restorePhysioMedia({ cards, store, fetchFn })).toEqual({ restored: 5, failed: 1 })
    expect(await store.has(cards[0].hash)).toBe(false)
    expect(await store.has(await sha256Hex(new TextEncoder().encode('not the card')))).toBe(false)
  })
})
