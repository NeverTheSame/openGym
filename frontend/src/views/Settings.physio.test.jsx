// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import { createMediaStore, memoryBackend, _setMediaStore } from '../lib/media-store.js'
import { buildPhysioState } from '../lib/physioSeed.js'
import cards from '../lib/physio-cards.json'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Settings in the physio build (VITE_PHYSIO=1), which has no server: where the account would be,
   "Your data" holds the backup rows — import, export, export with the card pictures — and
   nothing about signing in, syncing or the demo. The rows are the ones Data shows elsewhere, so
   they are not shown twice. "Reset everything" leaves the card pictures: the exercises they belong
   to come straight back (useStore resetEverything). */
const mocks = vi.hoisted(() => {
  const state = { S: null }
  // Stable across renders: KeptChangesRows re-asks whenever the function changes.
  state.keptChanges = async () => []
  state.confirmSheet = vi.fn()
  state.resetEverything = vi.fn()
  state.snapshot = () => ({
    S: state.S, user: null, config: null, sync: { status: 'local' }, coachLocal: null,
    update: vi.fn(), replaceState: vi.fn(), setUser: vi.fn(), pullState: vi.fn(), pushState: vi.fn(),
    signOut: vi.fn(), signOutAll: vi.fn(), resetDemo: vi.fn(), disconnectServer: vi.fn(),
    syncNow: vi.fn(), unsyncedChanges: () => ({ owed: false, count: 0 }), keptChanges: state.keptChanges,
    stashedMediaHashes: async () => new Set(), importConflict: async () => null, importBackup: vi.fn(), resetEverything: state.resetEverything
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { time: '17:30' }, workouts: [] }, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(() => Promise.reject(new Error('no API in the physio build'))), webauthnOK: () => true, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false,
}))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), shareExportBlob: vi.fn(), syncReminder: vi.fn() }))
vi.mock('../lib/coach-api.js', () => ({ forgetCoach: vi.fn(() => Promise.resolve()) }))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), confirmSheet: (...a) => mocks.confirmSheet(...a), importFromApp: vi.fn(),
  importFromHevy: vi.fn(), equipmentProfileSheet: vi.fn(), menuSheet: vi.fn(), askAddDeviceData: vi.fn(),
}))
vi.mock('../lib/physio.js', async orig => ({ ...(await orig()), PHYSIO: true }))

globalThis.__APP_VERSION__ ??= 'test'

let host, root, media
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
const titles = () => [...host.querySelectorAll('.sect-t')].map(h => h.textContent)
const section = title => [...host.querySelectorAll('section.sect')].find(s => s.querySelector('.sect-t')?.textContent === title)
const rowTitles = el => [...el.querySelectorAll('.lrow-t')].map(r => r.textContent)
const until = async (cond, ms = 4000) => {
  const end = Date.now() + ms
  while (!(await cond()) && Date.now() < end) await act(async () => { await new Promise(r => setTimeout(r, 10)) })
}

beforeEach(async () => {
  media = createMediaStore(memoryBackend())
  _setMediaStore(media)
  mocks.confirmSheet.mockClear()
  mocks.resetEverything.mockClear()
  mocks.S = { unit: 'kg', sound: false, effort: 'none', gifSize: 'full', workouts: [], exWeights: {}, ...buildPhysioState() }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<Settings />))
  await settle()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  _setMediaStore(null)
})

describe('Settings — physio build', () => {
  it('opens with "Your data": the backup rows, the zip one included for the card pictures', () => {
    expect(titles()[0]).toBe('Your data')
    expect(rowTitles(section('Your data'))).toEqual(['Import backup', 'Export backup (JSON)', 'Export with photos & videos (.zip)'])
    expect(host.querySelector('input[type="file"][accept=".json,.zip,application/json,application/zip"]')).toBeTruthy()
  })

  it('shows each backup row once, and Data keeps the rest', () => {
    const all = rowTitles(host)
    for (const r of ['Import backup', 'Export backup (JSON)', 'Export with photos & videos (.zip)']) expect(all.filter(x => x === r)).toHaveLength(1)
    expect(rowTitles(section('Data'))).toEqual(expect.arrayContaining(['Load starter plan', 'Photos & videos', 'Reset everything']))
  })

  it('says nothing about an account, signing in, syncing or the demo', () => {
    expect(titles()).not.toContain('Account')
    expect(titles()).not.toContain('Demo')
    const text = host.textContent
    for (const s of ['Sign in', 'Create passkey profile', 'Reset demo data', 'Self-host openGym', 'Guest mode', 'synced with your profile']) expect(text).not.toContain(s)
  })

  it('Reset everything keeps the card pictures and takes every other file', async () => {
    const other = 'c'.repeat(64)
    for (const c of cards) await media.put(c.hash, new Blob(['card ' + c.n]), { mime: 'image/webp', pending: false })
    await media.put(other, new Blob(['x']), { mime: 'image/png', pending: false })
    await new Promise(r => setTimeout(r, 5))   // put before the reset, not in the same moment
    act(() => { [...host.querySelectorAll('.lrow')].find(r => r.textContent.includes('Reset everything')).click() })
    act(() => { mocks.confirmSheet.mock.calls[0][0].onConfirm() })
    expect(mocks.resetEverything).toHaveBeenCalledTimes(1)
    await until(async () => !(await media.has(other)))
    expect(await media.has(other)).toBe(false)
    expect((await media.list()).map(r => r.hash).sort()).toEqual(cards.map(c => c.hash).sort())
  })
})
