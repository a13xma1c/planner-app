import { screen } from '@testing-library/react'
import { Link } from 'react-router'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '@/test/utils'

import { useUrlState } from './useUrlState'

const parse = (p: URLSearchParams) => ({ q: p.get('q') ?? '', n: Number(p.get('n') ?? 0) })
const serialize = (v: { q: string; n: number }, prev: URLSearchParams) => {
  const next = new URLSearchParams(prev)
  if (v.q) next.set('q', v.q)
  else next.delete('q')
  if (v.n) next.set('n', String(v.n))
  else next.delete('n')
  return next
}

function Harness() {
  const [value, set] = useUrlState(parse, serialize)
  return (
    <>
      <pre data-testid="value">{JSON.stringify(value)}</pre>
      <button onClick={() => set({ ...value, n: value.n + 1 })}>inc</button>
      <button onClick={() => set({ q: 'typed', n: value.n })}>type</button>
      <Link to="?q=external&n=9&keep=1">external</Link>
    </>
  )
}

describe('useUrlState', () => {
  it('initialises from the URL, updates synchronously and mirrors into the URL', async () => {
    const { user, router } = renderWithProviders(<Harness />, { route: '/?q=start&other=x' })
    expect(screen.getByTestId('value')).toHaveTextContent('{"q":"start","n":0}')
    await user.click(screen.getByText('inc'))
    expect(screen.getByTestId('value')).toHaveTextContent('{"q":"start","n":1}')
    expect(router.state.location.search).toBe('?q=start&other=x&n=1')
    await user.click(screen.getByText('type'))
    expect(router.state.location.search).toBe('?q=typed&other=x&n=1')
  })

  it('adopts external URL changes', async () => {
    const { user } = renderWithProviders(<Harness />, { route: '/' })
    await user.click(screen.getByText('external'))
    expect(screen.getByTestId('value')).toHaveTextContent('{"q":"external","n":9}')
  })
})
