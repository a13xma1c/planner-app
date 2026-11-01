import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('kaboom')
  return <p>all good</p>
}

describe('ErrorBoundary', () => {
  it('shows a recovery panel and can try again', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Harness() {
      const [explode, setExplode] = useState(true)
      return (
        <ErrorBoundary>
          <button onClick={() => setExplode(false)}>defuse</button>
          <Bomb explode={explode} />
        </ErrorBoundary>
      )
    }
    render(<Harness />)
    expect(screen.getByRole('alert')).toHaveTextContent('kaboom')
    // "Try again" re-renders the subtree; the bomb still explodes, so the panel stays
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('resets when the resetKey changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Bomb explode />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(
      <ErrorBoundary resetKey="b">
        <Bomb explode={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('all good')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('supports a custom fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary fallback={(error) => <p>custom: {error.message}</p>}>
        <Bomb explode />
      </ErrorBoundary>,
    )
    expect(screen.getByText('custom: kaboom')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
