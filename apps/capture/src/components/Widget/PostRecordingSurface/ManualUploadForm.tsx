import { Block, Col, Row } from '@jsxstyle/react'
import { Button, FormField, Input, Label, color, spacing } from '@repro/design'
import { BugPlayIcon } from 'lucide-react'
import React from 'react'
import { useForm } from 'react-hook-form'

interface FormState {
  title: string
  description: string
}

interface ManualUploadFormProps {
  onSubmit(data: FormState): void
  isUploading: boolean
}

export const ManualUploadForm: React.FC<ManualUploadFormProps> = ({
  onSubmit,
  isUploading,
}) => {
  const { handleSubmit, register, formState } = useForm<FormState>({
    defaultValues: {
      title: '',
      description: '',
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Col gap={spacing.md} padding={spacing.md}>
        <FormField>
          <Label htmlFor="manual-title">Title</Label>
          {formState.errors.title && (
            <Block color={color.danger} fontSize={12}>
              Please enter a title
            </Block>
          )}
          <Input
            {...register('title', { required: true })}
            id="manual-title"
            autoFocus={true}
            context={formState.errors.title !== undefined ? 'error' : 'normal'}
            placeholder="What is the bug?"
            size="medium"
          />
        </FormField>

        <FormField>
          <Label htmlFor="manual-description">Description</Label>
          <Input
            {...register('description')}
            id="manual-description"
            size="medium"
            placeholder="Is there anything else that would be useful to know?"
            rows={6}
          />
        </FormField>

        <Row>
          <Button
            type="submit"
            context="success"
            size="medium"
            disabled={isUploading}
          >
            <BugPlayIcon size={20} />
            Create Bug Report
          </Button>
        </Row>
      </Col>
    </form>
  )
}
