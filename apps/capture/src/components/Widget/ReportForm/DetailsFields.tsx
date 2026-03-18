import { Block, Col, Row } from '@jsxstyle/react'
import { Button, colors, FormField, Input, Label } from '@repro/design'
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
        <FormField>
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
        </FormField>

        <FormField>
          <Label htmlFor="report-description">
            Description
          </Label>
          <Input
            {...register('description')}
            id="report-description"
            size="medium"
            placeholder="Is there anything else that would be useful to know?"
            rows={12}
          />
        </FormField>

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
