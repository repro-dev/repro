import { Col, Row } from '@jsxstyle/react'
import { Button, spacing, TextField } from '@repro/design'
import { BugPlayIcon } from 'lucide-react'
import React from 'react'
import { useForm, useWatch } from 'react-hook-form'

interface FormState {
  title: string
  description: string
  isPublic: boolean
}

interface Props {
  onSubmit(data: FormState): void
  initialValues?: Pick<FormState, 'title' | 'description'>
  onValuesChange?(values: Pick<FormState, 'title' | 'description'>): void
  disabled?: boolean
  submitDisabled?: boolean
  submitLabel?: string
}

export const DetailsFields: React.FC<Props> = ({
  onSubmit,
  initialValues,
  onValuesChange,
  disabled = false,
  submitDisabled = false,
  submitLabel = 'Create Bug Report',
}) => {
  const { handleSubmit, register, formState, control } = useForm<FormState>({
    defaultValues: {
      title: initialValues?.title ?? '',
      description: initialValues?.description ?? '',
      isPublic: true,
    },
  })
  const title = useWatch({ control, name: 'title' })
  const description = useWatch({ control, name: 'description' })

  React.useEffect(() => {
    onValuesChange?.({ title: title ?? '', description: description ?? '' })
  }, [description, onValuesChange, title])

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Col gap={spacing['2xl']}>
        <TextField
          label="Title"
          id="report-title"
          autoFocus
          invalid={!!formState.errors.title}
          error={
            formState.errors.title
              ? { message: 'Please enter a title' }
              : undefined
          }
          placeholder="What is the bug?"
          size="large"
          disabled={disabled}
          {...register('title', { required: true })}
        />

        <TextField
          label="Description"
          id="report-description"
          size="medium"
          placeholder="Is there anything else that would be useful to know?"
          rows={12}
          disabled={disabled}
          {...register('description')}
        />

        <Row>
          <Button
            type="submit"
            context="success"
            size="large"
            disabled={disabled || submitDisabled}
          >
            <BugPlayIcon size={20} />
            {submitLabel}
          </Button>
        </Row>
      </Col>
    </form>
  )
}
