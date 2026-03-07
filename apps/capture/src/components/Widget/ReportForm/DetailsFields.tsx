import { Block, Col, Row } from '@jsxstyle/react'
import { Button, colors, Input, Label, spacing } from '@repro/design'
import { BugPlayIcon } from 'lucide-react'
import React, { PropsWithChildren } from 'react'
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
      <Col gap={20}>
        <Col gap={spacing.md}>
          <Label htmlFor="report-title">Title</Label>
          {formState.errors.title && <Error>Please enter a title</Error>}
          <Input
            {...register('title', { required: true })}
            id="report-title"
            autoFocus={true}
            context={formState.errors.title !== undefined ? 'error' : 'normal'}
            placeholder="What is the bug?"
            size="large"
          />
        </Col>

        <Col gap={spacing.md}>
          <Label htmlFor="report-description" optional>
            Description
          </Label>
          <Input
            {...register('description')}
            id="report-description"
            size="medium"
            placeholder="Is there anything else that would be useful to know?"
            rows={12}
          />
        </Col>

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

const Error: React.FC<PropsWithChildren> = ({ children }) => (
  <Block color={colors.rose['700']}>{children}</Block>
)
