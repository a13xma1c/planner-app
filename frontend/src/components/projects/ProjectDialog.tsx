import { useState, type FormEvent } from 'react'

import { useCreateProject, useUpdateProject } from '@/api/queries'
import type { Project } from '@/api/types'
import { PROJECT_COLORS } from '@/lib/meta'

import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, Input, Textarea } from '../ui/Input'
import { ColorSwatches } from '../ui/Misc'
import { useToast } from '../ui/toastContext'

interface ProjectDialogProps {
  open: boolean
  onClose: () => void
  project?: Project | null
  onSaved?: (project: Project) => void
}

export function ProjectDialog({ open, onClose, project, onSaved }: ProjectDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={project ? 'Edit project' : 'New project'}
      size="sm"
    >
      {open && <ProjectForm onClose={onClose} project={project} onSaved={onSaved} />}
    </Dialog>
  )
}

function ProjectForm({ onClose, project, onSaved }: Omit<ProjectDialogProps, 'open'>) {
  const toast = useToast()
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]!)
  const [error, setError] = useState<string | null>(null)

  const done = (p: Project) => {
    toast.success(project ? 'Project updated' : `Project "${p.name}" created`)
    onSaved?.(p)
    onClose()
  }
  const fail = (e: Error) => setError(e.message)
  const create = useCreateProject({ onSuccess: done, onError: fail })
  const update = useUpdateProject({ onSuccess: done, onError: fail })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const data = { name: name.trim(), description: description.trim(), color }
    if (!data.name) return
    if (project) update.mutate({ id: project.id, data })
    else create.mutate(data)
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="project-form">
      <Field label="Name" htmlFor="p-name">
        <Input
          id="p-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder="e.g. Home renovation"
        />
      </Field>
      <Field label="Description" htmlFor="p-desc">
        <Textarea
          id="p-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </Field>
      <Field label="Colour">
        <ColorSwatches colors={PROJECT_COLORS} value={color} onChange={setColor} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={create.isPending || update.isPending}
          disabled={!name.trim()}
        >
          {project ? 'Save' : 'Create project'}
        </Button>
      </div>
    </form>
  )
}
