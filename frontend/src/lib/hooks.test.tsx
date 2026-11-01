import { act, fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { matchesCombo, useDebounced, useHotkeys, useLocalStorage } from './hooks'

function key(init: KeyboardEventInit & { target?: Element } = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, ...init })
}

describe('matchesCombo', () => {
  it('matches plain keys', () => {
    expect(matchesCombo(key({ key: 'n' }), 'n')).toBe(true)
    expect(matchesCombo(key({ key: 'N', shiftKey: true }), 'n')).toBe(false)
    expect(matchesCombo(key({ key: 'N', shiftKey: true }), 'shift+n')).toBe(true)
  })

  it('matches modifier combos (ctrl or meta = mod)', () => {
    expect(matchesCombo(key({ key: 'k', ctrlKey: true }), 'mod+k')).toBe(true)
    expect(matchesCombo(key({ key: 'k', metaKey: true }), 'mod+k')).toBe(true)
    expect(matchesCombo(key({ key: 'k' }), 'mod+k')).toBe(false)
    expect(matchesCombo(key({ key: 'k', ctrlKey: true }), 'k')).toBe(false)
  })

  it('allows shifted symbols like ?', () => {
    expect(matchesCombo(key({ key: '?', shiftKey: true }), 'shift+?')).toBe(true)
    expect(matchesCombo(key({ key: '/', shiftKey: false }), '/')).toBe(true)
  })
})

describe('useHotkeys', () => {
  it('fires handlers and skips inputs unless allowed', () => {
    const handler = vi.fn()
    const always = vi.fn()
    renderHook(() =>
      useHotkeys([
        { combo: 'n', handler },
        { combo: 'escape', handler: always, allowInInput: true },
      ]),
    )
    fireEvent.keyDown(window, { key: 'n' })
    expect(handler).toHaveBeenCalledTimes(1)

    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'n' })
    expect(handler).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(always).toHaveBeenCalledTimes(1)
    input.remove()
  })

  it('removes the listener on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useHotkeys([{ combo: 'x', handler }]))
    unmount()
    fireEvent.keyDown(window, { key: 'x' })
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('useDebounced', () => {
  it('delays updates', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 200), {
      initialProps: { v: 'a' },
    })
    rerender({ v: 'b' })
    expect(result.current).toBe('a')
    act(() => vi.advanceTimersByTime(250))
    expect(result.current).toBe('b')
    vi.useRealTimers()
  })
})

describe('useLocalStorage', () => {
  it('persists values and supports functional updates', () => {
    const { result } = renderHook(() => useLocalStorage('k', 1))
    expect(result.current[0]).toBe(1)
    act(() => result.current[1](5))
    expect(JSON.parse(localStorage.getItem('k')!)).toBe(5)
    act(() => result.current[1]((p) => p + 1))
    expect(result.current[0]).toBe(6)
  })

  it('reads an existing value and survives corrupt JSON', () => {
    localStorage.setItem('k', JSON.stringify('stored'))
    expect(renderHook(() => useLocalStorage('k', 'x')).result.current[0]).toBe('stored')
    localStorage.setItem('bad', '{not json')
    expect(renderHook(() => useLocalStorage('bad', 'fallback')).result.current[0]).toBe('fallback')
  })
})
