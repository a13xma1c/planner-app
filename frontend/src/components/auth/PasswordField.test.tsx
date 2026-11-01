import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { PasswordField } from './PasswordField'

function Harness({ context }: { context?: { email?: string; displayName?: string } }) {
  const [value, setValue] = useState('')
  return <PasswordField value={value} onChange={setValue} context={context} />
}

describe('PasswordField', () => {
  it('starts neutral, then rates and updates the checklist as you type', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const meter = screen.getByRole('meter', { name: 'Password strength' })
    expect(meter).toHaveAttribute('aria-valuetext', 'Not rated')
    expect(screen.getByTestId('password-label')).toHaveTextContent('—')
    expect(screen.getByTestId('check-length')).not.toHaveAttribute('data-passed')

    const input = screen.getByLabelText('Password')
    expect(screen.getByTestId('password-meter')).toHaveAttribute('data-percent', '0')
    await user.type(input, 'pass')
    expect(screen.getByTestId('password-label')).toHaveTextContent('Very weak')
    expect(screen.getByTestId('password-meter')).toHaveAttribute('data-percent', '8')
    expect(screen.getByTestId('check-length')).toHaveAttribute('data-passed', 'false')
    expect(screen.getByTestId('check-common')).toHaveAttribute('data-passed', 'false')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(
      within(screen.getByRole('list', { name: 'Suggestions' })).getAllByRole('listitem').length,
    ).toBeGreaterThan(0)

    // the bar fills progressively, keystroke by keystroke
    await user.clear(input)
    // one keystroke at a time, reading the fill after each (sequential by nature)
    const fills = await 'orbit-cactus-lantern-7'.split('').reduce(async (acc, ch) => {
      const list = await acc
      await user.type(input, ch)
      return [...list, Number(screen.getByTestId('password-meter').getAttribute('data-percent'))]
    }, Promise.resolve<number[]>([]))
    expect(fills).toEqual([...fills].sort((a, b) => a - b))
    expect(new Set(fills).size).toBeGreaterThan(6)
    expect(fills[fills.length - 1]).toBe(100)
    expect(screen.getByTestId('password-label')).toHaveTextContent('Strong')
    expect(meter).toHaveAttribute('aria-valuenow', '4')
    expect(meter.firstElementChild).toHaveStyle({ width: '100%', backgroundColor: '#10b981' })
    expect(screen.getByTestId('check-length')).toHaveAttribute('data-passed', 'true')
    expect(screen.getByTestId('check-common')).toHaveAttribute('data-passed', 'true')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('list', { name: 'Suggestions' })).not.toBeInTheDocument()
  })

  it('flags passwords containing the name or email from the context', async () => {
    const user = userEvent.setup()
    render(<Harness context={{ email: 'ann.lee@example.com', displayName: 'Ann Lee' }} />)
    await user.type(screen.getByLabelText('Password'), 'Ann-Lee-forever-2030')
    expect(screen.getByTestId('check-personal')).toHaveAttribute('data-passed', 'false')
    expect(screen.getByTestId('password-label')).toHaveTextContent('Weak')
  })

  it('toggles visibility without stealing focus from the input', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Password')
    await user.type(input, 'secret-value-9')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveFocus()

    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('aria-controls', input.id)
    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('secret-value-9')
    expect(input).toHaveFocus() // mousedown is prevented so typing can continue
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('works from the keyboard', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Password')
    await user.type(input, 'abc')
    await user.tab({ shift: true }) // the toggle sits in the label row, just before the input
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(input).toHaveAttribute('type', 'text')
    await user.keyboard(' ')
    expect(input).toHaveAttribute('type', 'password')
  })

  it('can hide the strength panel for existing-password fields', () => {
    render(
      <PasswordField
        value=""
        onChange={() => {}}
        showStrength={false}
        autoComplete="current-password"
        label="Current"
      />,
    )
    expect(screen.queryByTestId('password-strength')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Current')).toHaveAttribute('autocomplete', 'current-password')
  })
})
