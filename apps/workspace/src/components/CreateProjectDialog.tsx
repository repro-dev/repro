import { Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Button, FormFieldError, Input, Modal, spacing } from '@repro/design'
import { Project } from '@repro/domain'
import { createProject as defaultCreateProject } from '@repro/workspace-api'
import { fork } from 'fluture'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectContext } from '~/ProjectContext'

export interface CreateProjectDialogProps {
  open: boolean
  onClose: () => void
  // Injectable for testing; defaults to real workspace-api function.
  createProjectFn?: typeof defaultCreateProject
  // Injectable for testing; defaults to addProject from context.
  addProjectFn?: (project: Project) => void
  // Injectable for testing; defaults to useNavigate().
  navigateFn?: (path: string) => void
}

const MAX_NAME_LENGTH = 100

export const CreateProjectDialog: React.FC<CreateProjectDialogProps> = ({
  open,
  onClose,
  createProjectFn = defaultCreateProject,
  addProjectFn,
  navigateFn,
}) => {
  const apiClient = useApiClient()
  const { addProject } = useProjectContext()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cancel ref holds the fluture Cancel function so we can cancel on unmount.
  const cancelRef = useRef<(() => void) | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName('')
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  // Cancel any in-flight request on unmount
  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current()
      }
    }
  }, [])

  const effectiveAddProject = addProjectFn ?? addProject
  const effectiveNavigate = navigateFn ?? navigate

  const handleSubmit = useCallback(
    (evt: React.FormEvent) => {
      evt.preventDefault()

      // Prevent double-submit if a request is already in flight.
      if (submitting) {
        return
      }

      const trimmed = name.trim()
      if (!trimmed) {
        setError('Project name is required.')
        return
      }
      if (trimmed.length > MAX_NAME_LENGTH) {
        setError(`Project name must be ${MAX_NAME_LENGTH} characters or fewer.`)
        return
      }

      setSubmitting(true)
      setError(null)

      const future = createProjectFn(apiClient, trimmed)

      const cancel = fork((_err: Error) => {
        setError('Failed to create project. Please try again.')
        setSubmitting(false)
        cancelRef.current = null
      })((project: Project) => {
        effectiveAddProject(project)
        onClose()
        effectiveNavigate('/')
        cancelRef.current = null
      })(future)

      // fluture's Cancel is typed as an opaque function
      cancelRef.current = cancel as unknown as () => void
    },
    [
      submitting,
      name,
      apiClient,
      createProjectFn,
      effectiveAddProject,
      effectiveNavigate,
      onClose,
    ]
  )

  const isNameValid =
    name.trim().length > 0 && name.trim().length <= MAX_NAME_LENGTH

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      aria-label="Create project"
      width={480}
      height="auto"
    >
      <Col
        component="form"
        gap={spacing.lg}
        padding={spacing.xl}
        props={{ onSubmit: handleSubmit }}
      >
        <Modal.Header title="Create project" />

        <Input
          aria-label="Project name"
          autoFocus
          placeholder="Project name"
          value={name}
          onChange={evt => setName(evt.target.value)}
          disabled={submitting}
        />

        <FormFieldError error={{ message: error ?? undefined }} />

        <Row justifyContent="flex-end" gap={spacing.md}>
          <Button
            variant="outlined"
            context="neutral"
            size="medium"
            rounded
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            context="info"
            size="medium"
            rounded
            disabled={submitting || !isNameValid}
            type="submit"
          >
            Create
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}
