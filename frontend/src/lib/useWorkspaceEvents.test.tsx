import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestQueryClient } from '@/test/utils'

import { useWorkspaceEvents } from './useWorkspaceEvents'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  listeners = new Map<string, Set<(e: MessageEvent) => void>>()
  closed = false
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, cb: (e: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(cb)
  }
  removeEventListener(type: string, cb: (e: MessageEvent) => void) {
    this.listeners.get(type)?.delete(cb)
  }
  close() {
    this.closed = true
  }
  emit(type: string, data: unknown) {
    for (const cb of this.listeners.get(type) ?? []) {
      cb({ data: JSON.stringify(data) } as MessageEvent)
    }
  }
}

function setup() {
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useWorkspaceEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('subscribes to the workspace stream and invalidates queries on changes (coalesced)', () => {
    const { client, wrapper } = setup()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { unmount } = renderHook(() => useWorkspaceEvents(7), { wrapper })
    expect(FakeEventSource.instances).toHaveLength(1)
    const source = FakeEventSource.instances[0]!
    expect(source.url).toBe('/api/events?workspace=7')

    act(() => {
      source.emit('changed', { entity: 'tasks' })
      source.emit('changed', { entity: 'tasks' })
    })
    expect(spy).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(200))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ queryKey: [7] })

    act(() => source.emit('changed', { entity: 'members' }))
    act(() => vi.advanceTimersByTime(200))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['workspaces'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: [7, 'members'] })

    act(() => {
      for (const cb of source.listeners.get('changed') ?? [])
        cb({ data: 'not json' } as MessageEvent)
    })
    act(() => vi.advanceTimersByTime(200))
    expect(spy).toHaveBeenLastCalledWith({ queryKey: [7] }) // malformed frames fall back to "all"

    unmount()
    expect(source.closed).toBe(true)
  })

  it('does nothing when disabled or EventSource is unavailable', () => {
    const { wrapper } = setup()
    renderHook(() => useWorkspaceEvents(1, false), { wrapper })
    expect(FakeEventSource.instances).toHaveLength(0)
    vi.stubGlobal('EventSource', undefined)
    renderHook(() => useWorkspaceEvents(1), { wrapper })
    expect(FakeEventSource.instances).toHaveLength(0)
  })
})
