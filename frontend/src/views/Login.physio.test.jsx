// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Login from './Login.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The physio build (VITE_PHYSIO=1) has nothing to sign in to. Boot makes the browser a guest, so
   the sign-in screen is never meant to show; should it be reached all the same, it makes the
   browser a guest again and goes to Home — no sign-in buttons, and not the demo's landing screen. */
const mocks = vi.hoisted(() => ({ setGuest: null }))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ config: null, S: {}, user: null, setUser: vi.fn(), adoptProfile: vi.fn(), setGuest: mocks.setGuest, loadConfig: vi.fn(async () => null) })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  webauthnOK: () => true, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), BIO: 'your fingerprint', bio: () => 'your fingerprint',
  api: vi.fn(), passkeyAssertion: vi.fn(), passwordLogin: vi.fn(), passwordRegister: vi.fn(), passwordResetRedeem: vi.fn(),
  createPasskey: vi.fn(),
}))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn(), confirmSheet: vi.fn() }))
vi.mock('../lib/physio.js', async orig => ({ ...(await orig()), PHYSIO: true }))

function Where() { return <output>{useLocation().pathname}</output> }

let root, host
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('Login — physio build', () => {
  it('makes the browser a guest again and goes to Home, showing no way to sign in', () => {
    mocks.setGuest = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root.render(<MemoryRouter initialEntries={['/settings']}><Login /><Where /></MemoryRouter>))
    expect(mocks.setGuest).toHaveBeenCalledWith(true)
    expect(host.querySelector('output').textContent).toBe('/home')
    expect(host.querySelectorAll('button')).toHaveLength(0)
    expect(host.textContent).not.toMatch(/sign in|passkey|demo/i)
  })
})
