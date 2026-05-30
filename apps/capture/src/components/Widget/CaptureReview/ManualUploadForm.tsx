import { Block, Col, Row } from '@jsxstyle/react'
import {
  Button,
  FormField,
  Input,
  Label,
  color,
  spacing,
  textStyles,
} from '@repro/design'
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
  uploadAvailability?:
    | { available: true }
    | { available: false; reason: string }
}

export const ManualUploadForm: React.FC<ManualUploadFormProps> = ({
  onSubmit,
  isUploading,
  uploadAvailability = { available: true },
}) => {
  const { handleSubmit, register, formState } = useForm<FormState>({
    defaultValues: {
      title: '',
      description: '',
    },
  })

  const uploadUnavailable = !uploadAvailability.available

  return (
    <form
      onSubmit={event => {
        if (uploadUnavailable) {
          event.preventDefault()
          return
        }

        return handleSubmit(onSubmit)(event)
      }}
    >
      <Col gap={spacing.md} padding={spacing.md}>
        {uploadUnavailable && (
          <Block {...textStyles.caption} color={color.text.secondary}>
            {uploadAvailability.reason}
          </Block>
        )}

        <FormField>
          <Label htmlFor="manual-title">Title</Label>
          {formState.errors.title && (
            <Block {...textStyles.caption} color={color.danger}>
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
            disabled={isUploading || uploadUnavailable}
          >
            <BugPlayIcon size={20} />
            Create Bug Report
          </Button>
        </Row>
      </Col>
    </form>
  )
}
