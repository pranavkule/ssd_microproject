import { test, vi } from 'vitest'
import { render } from '@testing-library/react'

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO)
window.matchMedia =
  window.matchMedia ||
  ((q: string) =>
    ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }) as unknown as MediaQueryList)

const { default: App } = await import('../App')

test('app renders without crashing', () => {
  render(<App />)
})
