import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { ConfirmDialog, Dialog } from './Dialog'
import { ColorSwatches, EmptyState, ErrorState, ProgressBar } from './Misc'
import { ToastProvider } from './Toast'
import { useToast } from './toastContext'

describe('Button', () => {
  it('shows a spinner and disables while loading', () => {
    render(<Button loading>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Checkbox', () => {
  it('toggles and stops propagation', async () => {
    const onChange = vi.fn()
    const outer = vi.fn()
    render(
      <div role="presentation" onClick={outer}>
        <Checkbox checked={false} onChange={onChange} label="Complete thing" />
      </div>,
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'Complete thing' }))
    expect(onChange).toHaveBeenCalledWith(true)
    expect(outer).not.toHaveBeenCalled()
  })
})

describe('Dialog', () => {
  function Harness() {
    const [open, setOpen] = useState(true)
    return (
      <>
        <button onClick={() => setOpen(true)}>reopen</button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Hello" description="desc">
          <input aria-label="first" />
          <button>second</button>
        </Dialog>
      </>
    )
  }

  it('renders accessibly, focuses the first field and closes on Escape / backdrop', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const dialog = screen.getByRole('dialog', { name: 'Hello' })
    expect(within(dialog).getByText('desc')).toBeInTheDocument()
    expect(screen.getByLabelText('first')).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByText('reopen'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByTestId('dialog-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('traps focus with Tab', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const closeBtn = screen.getByRole('button', { name: 'Close' })
    expect(screen.getByLabelText('first')).toHaveFocus()
    await user.tab()
    expect(screen.getByText('second')).toHaveFocus()
    await user.tab()
    expect(closeBtn).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByText('second')).toHaveFocus()
  })

  it('ConfirmDialog wires confirm/cancel', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Sure?"
        message="really"
        confirmLabel="Yes"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onConfirm).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('Toast', () => {
  function Trigger() {
    const toast = useToast()
    return (
      <>
        <button onClick={() => toast.success('Saved', 'All good')}>ok</button>
        <button onClick={() => toast.error('Failed')}>err</button>
        <button
          onClick={() =>
            toast.toast({
              title: 'Undo?',
              action: { label: 'Undo', onClick: () => toast.success('Undone') },
            })
          }
        >
          action
        </button>
      </>
    )
  }

  it('shows, dismisses and runs actions', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await user.click(screen.getByText('ok'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.getByText('All good')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await user.click(screen.getByText('action'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('status')).toHaveTextContent('Undone')
  })

  it('throws when used outside the provider', () => {
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/)
  })
})

describe('Misc', () => {
  it('ProgressBar clamps and exposes aria values', () => {
    render(<ProgressBar value={1.5} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('EmptyState and ErrorState render content', () => {
    const retry = vi.fn()
    render(
      <>
        <EmptyState title="Nothing" description="Add some" action={<button>go</button>} />
        <ErrorState error={new Error('boom')} retry={retry} />
      </>,
    )
    expect(screen.getByText('Nothing')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    screen.getByText('Try again').click()
    expect(retry).toHaveBeenCalled()
  })

  it('ColorSwatches acts as a radio group', async () => {
    const onChange = vi.fn()
    render(<ColorSwatches colors={['#111111', '#222222']} value="#111111" onChange={onChange} />)
    expect(screen.getByRole('radio', { name: '#111111' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: '#222222' }))
    expect(onChange).toHaveBeenCalledWith('#222222')
  })
})
