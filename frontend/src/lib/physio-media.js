// The card pictures of the physio build. A custom exercise can only show a picture that is in
// the device's media store under its sha256 (media-refs.js), so the files that ship with the
// app (public/physio/) are copied in — at the first boot, and again at any later one that
// finds them gone: iOS may empty the store while localStorage, and so the exercises, survive.
//
// `file` is relative ("physio/1.webp"), and that is the right address: the router lives behind
// the hash, so the page's own path is always the app's base (app-base.js).
import manifest from './physio-cards.json'
import { mediaStore } from './media-store.js'
import { sha256Hex } from './sha256.js'

/** Copies each card the store lacks into it, checked against the manifest's hash first. One
 *  that cannot be had now (offline, a 404, other bytes) is counted and left for the next boot.
 *  Never throws. Resolves { restored, failed }. */
export async function restorePhysioMedia({ cards = manifest, store = mediaStore, fetchFn = (...a) => fetch(...a) } = {}) {
  let restored = 0, failed = 0
  for (const c of cards) {
    try {
      if (await store.get(c.hash)) continue
      const res = await fetchFn(c.file)
      if (!res || !res.ok) throw new Error('physio-media: ' + c.file)
      const bytes = new Uint8Array(await (await res.blob()).arrayBuffer())
      if ((await sha256Hex(bytes)) !== c.hash) throw new Error('physio-media: hash ' + c.file)
      await store.put(c.hash, new Blob([bytes], { type: 'image/webp' }), { mime: 'image/webp', pending: false })
      restored++
    } catch { failed++ }
  }
  return { restored, failed }
}
