import { zodResolver } from '@hookform/resolvers/zod'
import { Block, Col, Row } from '@jsxstyle/react'
import {
  Alert,
  Button,
  color,
  Divider,
  FormField,
  Input,
  Label,
  textStyles,
} from '@repro/design'
import { isValidationError } from '@repro/validation'
import { done } from 'fluture'
import { AlertCircleIcon } from 'lucide-react'
import React, { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import z from 'zod'
import { GoogleSignInButton } from './GoogleSignInButton'
import { useRegister } from './hooks'

const formSchema = z
  .object({
    accountName: z.string(),
    userName: z.string(),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmedPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters'),
  })
  .refine(values => values.password === values.confirmedPassword, {
    message: 'Passwords do not match',
    path: ['confirmedPassword'],
  })

type FormState = z.infer<typeof formSchema>

interface Props {
  onSuccess(): void
  onFailure(error: Error): void
}

export const RegisterForm: React.FC<Props> = ({ onSuccess, onFailure }) => {
  const [errorMessage, setErrorMessage] = useState('')

  // const navigate = useNavigate()
  const registerAccount = useRegister()

  const methods = useForm({
    mode: 'onChange',
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountName: '',
      userName: '',
      email: '',
      password: '',
      confirmedPassword: '',
    },
  })

  const { register, formState, handleSubmit } = methods

  function onSubmit(data: FormState) {
    const registration = registerAccount(
      data.accountName,
      data.userName,
      data.email,
      data.password
    )

    registration.pipe(
      done(error => {
        if (error) {
          if (
            error.name === 'TooManyRequests' ||
            (error as any).statusCode === 429
          ) {
            setErrorMessage(
              'Too many registration attempts. Please try again later.'
            )
          } else if (isValidationError(error)) {
            setErrorMessage(`Form invalid: ${error.message}`)
          } else if (error.name === 'ResourceConflictError') {
            setErrorMessage('User already exists for this email address.')
          } else {
            setErrorMessage('Unable to register account. Please try again.')
          }

          onFailure(error)
        } else {
          onSuccess()
        }
      })
    )
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Col gap={16}>
          <Col gap={12}>
            <Block
              component="h1"
              {...textStyles.heading2}
              color={color.primary}
            >
              Create account
            </Block>

            <Block
              component="p"
              {...textStyles.bodySmall}
              color={color.text.muted}
            >
              Create a new Repro account.
            </Block>
          </Col>

          {errorMessage && (
            <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
              {errorMessage}
            </Alert>
          )}

          <FormField>
            <Label htmlFor="reg-account">Company</Label>
            <Input
              id="reg-account"
              autoFocus={true}
              context={
                formState.errors.accountName != null ? 'error' : 'normal'
              }
              {...register('accountName', { required: true })}
            />
          </FormField>

          <FormField>
            <Label htmlFor="reg-name">Your name</Label>
            <Input
              id="reg-name"
              context={formState.errors.userName != null ? 'error' : 'normal'}
              {...register('userName', { required: true })}
            />
          </FormField>

          <FormField>
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              autoComplete="email"
              context={formState.errors.email != null ? 'error' : 'normal'}
              {...register('email', { required: true })}
            />
          </FormField>

          <FormField>
            <Label htmlFor="reg-password">Password</Label>
            <Input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              {...register('password', { required: true })}
            />
          </FormField>

          <FormField>
            <Label htmlFor="reg-confirm-password">Confirm password</Label>
            <Input
              id="reg-confirm-password"
              type="password"
              autoComplete="new-password"
              {...register('confirmedPassword', { required: true })}
            />
          </FormField>

          <Button
            disabled={!formState.isValid || formState.isSubmitting}
            type="submit"
          >
            Create account
          </Button>

          <Row alignItems="center" gap={8}>
            <Divider spacing="none" />
            <Block
              {...textStyles.caption}
              flexShrink={0}
              color={color.text.muted}
            >
              or
            </Block>
            <Divider spacing="none" />
          </Row>

          <GoogleSignInButton
            onClick={() => {
              window.location.href = '/account/oauth/google'
            }}
          />
        </Col>
      </form>
    </FormProvider>
  )
}
