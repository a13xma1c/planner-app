import { screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_FILTERS, type FilterState } from '@/lib/filters'
import { seedTask } from '@/test/fakeApi'
import { renderWithProviders } from '@/test/utils'

import { FilterBar } from './FilterBar'

function Harness({ initial = DEFAULT_FILTERS }: { initial?: FilterState }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <FilterBar value={value} onChange={setValue} />
      <pre data-testid="state">{JSON.stringify(value)}</pre>
    </>
  )
}

const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as FilterState

describe('FilterBar', () => {
  it('toggles status/priority pills and tags', async () => {
    seedTask({ tagNames: ['urgent-ish'] })
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(state().status).toEqual(['done'])
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(state().status).toEqual([])

    await user.click(screen.getByRole('button', { name: 'High' }))
    await user.click(screen.getByRole('button', { name: 'Low' }))
    expect(state().priority).toEqual(['high', 'low'])

    await user.click(await screen.findByRole('button', { name: '#urgent-ish' }))
    expect(state().tag).toEqual(['urgent-ish'])
  })

  it('debounces search input', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.type(screen.getByTestId('search-input'), 'milk')
    await waitFor(() => expect(state().search).toBe('milk'))
  })

  it('changes sort/order and shows completed', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.selectOptions(screen.getByLabelText('Sort by'), 'title')
    expect(state().sort).toBe('title')
    await user.click(screen.getByRole('button', { name: 'Order ascending' }))
    expect(state().order).toBe('desc')
    await user.click(screen.getByLabelText('Show completed'))
    expect(state().includeDone).toBe(true)
  })

  it('clears active filters but keeps the sort', async () => {
    const { user } = renderWithProviders(
      <Harness initial={{ ...DEFAULT_FILTERS, status: ['todo'], search: 'x', sort: 'title' }} />,
    )
    await user.click(screen.getByRole('button', { name: /Clear \(2\)/ }))
    expect(state()).toEqual({ ...DEFAULT_FILTERS, sort: 'title' })
  })
})
