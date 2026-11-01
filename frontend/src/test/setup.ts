import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'

import { resetDb } from './fakeApi'
import { server } from './server'

// ── Browser API shims missing from jsdom ────────────────────────────────────
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
if (!('ResizeObserver' in window)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(window, { ResizeObserver })
}
Element.prototype.scrollIntoView ??= () => {}
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock'
  URL.revokeObjectURL = () => {}
}

// ── MSW lifecycle ───────────────────────────────────────────────────────────
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  resetDb()
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())
