import { zodResolver } from '@hookform/resolvers/zod'
import { Col } from '@jsxstyle/react'
import React, { useMemo } from 'react'
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldValues,
  type SubmitHandler,
} from 'react-hook-form'
import type { ZodType } from 'zod'
import { spacing } from '../tokens/spacing'
import { FormActions } from './FormActions'
import { FormField } from './FormField'
import { FormSection } from './FormSection'
import { FormSubmit } from './FormSubmit'

type ValidationMode = 'onBlur' | 'onSubmit' | 'onChange'

export interface FormProps<T extends FieldValues> {
  schema: ZodType<T>
  defaultValues: DefaultValues<T>
  onSubmit: SubmitHandler<T>
  mode?: ValidationMode
  disabled?: boolean
  children?: React.ReactNode
}

/**
 * Schema-driven form orchestration component.
 *
 * Wraps `react-hook-form`'s `FormProvider` and renders a semantic `<form>`
 * element with consistent vertical spacing. Accepts a zod schema for
 * validation, default values, and a submit handler.
 *
 * Use `Form.Field` to declare fields that auto-wire validation, labels,
 * and error messages from the schema. Use `Form.Actions` and `Form.Submit`
 * for the submit button area.
 *
 * @example
 * ```tsx
 * <Form schema={loginSchema} defaultValues={{ email: '', password: '' }} onSubmit={handleLogin}>
 *   <Form.Field name="email" label="Email" type="email" required />
 *   <Form.Field name="password" label="Password" type="password" required />
 *   <Form.Actions>
 *     <Form.Submit>Log In</Form.Submit>
 *   </Form.Actions>
 * </Form>
 * ```
 */
function FormInner<T extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  mode = 'onBlur',
  disabled = false,
  children,
}: FormProps<T>) {
  const resolver = useMemo(() => zodResolver(schema), [schema])

  const methods = useForm<T>({
    resolver,
    defaultValues,
    mode,
  })

  return (
    <FormProvider {...methods}>
      <Col
        component="form"
        gap={spacing.xl}
        props={{
          onSubmit: methods.handleSubmit(onSubmit),
          noValidate: true,
          'aria-disabled': disabled || undefined,
        }}
      >
        {children}
      </Col>
    </FormProvider>
  )
}

type FormComponent = typeof FormInner & {
  Field: typeof FormField
  Actions: typeof FormActions
  Submit: typeof FormSubmit
  Section: typeof FormSection
}

export const Form = FormInner as FormComponent
Form.Field = FormField
Form.Actions = FormActions
Form.Submit = FormSubmit
Form.Section = FormSection
