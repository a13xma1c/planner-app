import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { useCreateWorkspace } from '@/api/queries'
import { workspacePath } from '@/lib/workspaceContext'

import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, Input } from '../ui/Input'
import { useToast } from '../ui/toastContext'

export function WorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New shared planner"
      description="A separate space with its own projects, tags and tasks. Invite people from its Members page."
      size="sm"
    >
      {open && <Form onClose={onClose} />}
    </Dialog>
  )
}

function Form({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const navigate = useNavigate()
  const toast = useToast()
  const create = useCreateWorkspace({
    onSuccess: (ws) => {
      toast.success(`Created "${ws.name}"`, 'Invite people from the Members page.')
      onClose()
      navigate(`${workspacePath(ws.id)}/members`)
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) create.mutate({ name: name.trim() })
  }
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="workspace-form">
      <Field label="Name" htmlFor="ws-name">
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Family, Team Rocket"
          required
          maxLength={100}
        />
      </Field>
      {create.error && (
        <p role="alert" className="text-sm text-rose-600">
          {create.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
          Create planner
        </Button>
      </div>
    </form>
  )
}
