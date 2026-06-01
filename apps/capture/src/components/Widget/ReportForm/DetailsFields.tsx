import { Col, Row } from '@jsxstyle/react'
import { Button, spacing, TextField } from '@repro/design'
import { BugPlayIcon } from 'lucide-react'
import React from 'react'
import { useForm } from 'react-hook-form'

interface FormState {
  title: string
  description: string
  isPublic: boolean
}

interface Props {
  onSubmit(data: FormState): void
}

export const DetailsFields: React.FC<Props> = ({ onSubmit }) => {
  const { handleSubmit, register, formState } = useForm<FormState>({
    defaultValues: {
      title: '',
      description: '',
      isPublic: true,
    },
  })

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
          {...register('title', { required: true })}
        />

        <TextField
          label="Description"
          id="report-description"
          size="medium"
          placeholder="Is there anything else that would be useful to know?"
          rows={12}
          {...register('description')}
        />

        <Row>
          <Button type="submit" context="success" size="large">
            <BugPlayIcon size={20} />
            Create Bug Report
          </Button>
        </Row>
      </Col>
    </form>
  )
}
