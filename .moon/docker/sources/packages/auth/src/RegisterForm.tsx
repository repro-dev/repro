import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Input, colors } from '@repro/design'
import { isValidationError } from '@repro/validation'
import { done } from 'fluture'
import { Block, Col } from '@jsxstyle/react'
import React, { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import z from 'zod'
import { useRegister } from './hooks'

interface Props {
  onSuccess(): void
  onFailure(error: Error): void
}

const formSchema = z
  .object({
    accountName: z.string(),
    userName: z.string(),
    email: z.string().email(),
    password: z.string().min(1),
    confirmedPassword: z.string().min(1),
  })
  .refine(values => values.password === values.confirmedPassword, {
    message: 'Passwords do not match',
    path: ['confirmedPassword'],
  })

type FormState = z.infer<typeof formSchema>

export const RegisterForm: React.FC<Props> = () => {
  const [errorMessage, setErrorMessage] = useState('')

  // const navigate = useNavigate()
  const registerAccount = useRegister()

  const methods = useForm<FormState>({
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
          if (isValidationError(error)) {
            setErrorMessage(`Form invalid: ${error.message}`)
          } else if (error.name === 'ResourceConflictError') {
            setErrorMessage('User already exists for this email address')
          } else {
            setErrorMessage('Unable to register account. Please try again.')
          }
        }
      })
    )
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Col gap={16}>
          <Block fontSize={15} fontWeight={700} color={colors.blue['700']}>
            Create New Account
          </Block>

          <Block
            paddingBottom={10}
            fontSize={13}
            lineHeight="1.5em"
            borderBottom={`1px solid ${colors.slate['200']}`}
            color={colors.slate['500']}
          >
            Register a new Repro account
          </Block>

          {errorMessage && (
            <Block
              alignSelf="stretch"
              padding={10}
              fontSize={13}
              lineHeight={1.5}
              backgroundColor={colors.rose['100']}
              color={colors.rose['700']}
              borderRadius={4}
              borderColor={colors.rose['300']}
              borderStyle="solid"
              borderWidth={1}
            >
              {errorMessage}
            </Block>
          )}

          <Input
            autoFocus={true}
            label="Company"
            context={formState.errors.accountName != null ? 'error' : 'normal'}
            {...register('accountName', { required: true })}
          />

          <Input
            label="Your name"
            context={formState.errors.userName != null ? 'error' : 'normal'}
            {...register('userName', { required: true })}
          />

          <Input
            label="Email"
            autoComplete="email"
            context={formState.errors.email != null ? 'error' : 'normal'}
            {...register('email', { required: true })}
          />

          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            {...register('password', { required: true })}
          />

          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            {...register('confirmedPassword', { required: true })}
          />

          <Button
            disabled={!formState.isValid || formState.isSubmitting}
            type="submit"
          >
            Create Account
          </Button>
        </Col>
      </form>
    </FormProvider>
  )
}
