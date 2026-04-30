import { zodResolver } from '@hookform/resolvers/zod'
import { Block, Col } from '@jsxstyle/react'
import { useAcceptInvitation, useSession, useSessionLoading } from '@repro/auth'
import {
  Alert,
  Button,
  Card,
  color,
  FormField,
  FormFieldError,
  Input,
  Label,
  spacing,
  textStyles,
} from '@repro/design'
import { logger } from '@repro/logger'
import { fork } from 'fluture'
import { AlertCircleIcon, InfoIcon } from 'lucide-react'
import React, { useCallback, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { useSearchParams } from 'react-router-dom'
import z from 'zod'

const formSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
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

const AcceptInvitationRoute: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const acceptInvitation = useAcceptInvitation()
  const session = useSession()
  const sessionLoading = useSessionLoading()

  const invitationToken = searchParams.get('invitationToken') ?? ''
  const email = searchParams.get('email') ?? ''

  const methods = useForm({
    mode: 'onChange',
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      password: '',
      confirmedPassword: '',
    },
  })

  const { register, formState, handleSubmit, setError } = methods
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = useCallback(
    (data: FormState) => {
      setSubmitting(true)
      fork((err: Error) => {
        logger.debug('accept invitation failed', err)
        setSubmitting(false)

        if (err.name === 'NotFoundError' || (err as any).statusCode === 404) {
          setError('root', {
            message:
              'This invitation link is invalid or has expired. Please request a new invitation.',
          })
        } else if (err.name === 'ResourceConflict') {
          setError('root', {
            message:
              'An account already exists for this email address. Please log in instead.',
          })
        } else if (
          err.name === 'TooManyRequests' ||
          (err as any).statusCode === 429
        ) {
          setError('root', {
            message: 'Too many attempts. Please try again later.',
          })
        } else {
          setError('root', {
            message: 'Unable to accept invitation. Please try again.',
          })
        }
      })(() => {
        logger.debug('accept invitation successful')
        setSubmitting(false)
        navigate('/')
      })(acceptInvitation(invitationToken, data.name, email, data.password))
    },
    [acceptInvitation, invitationToken, email, navigate, setError]
  )

  if (!sessionLoading && session !== null) {
    return (
      <Card>
        <Col gap={spacing.md}>
          <Block component="h1" {...textStyles.heading2} color={color.primary}>
            Already signed in
          </Block>

          <Alert type="info" icon={<InfoIcon size={16} />}>
            You are already signed in. Go to your workspace, or log out first to
            accept this invitation with a different account.
          </Alert>

          <Button onClick={() => navigate('/')}>Go to workspace</Button>
        </Col>
      </Card>
    )
  }

  if (!invitationToken || !email) {
    return (
      <Card>
        <Col gap={spacing.md}>
          <Block component="h1" {...textStyles.heading2} color={color.primary}>
            Invalid invitation link
          </Block>

          <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
            This invitation link is missing required information. Please use the
            link from your invitation email.
          </Alert>
        </Col>
      </Card>
    )
  }

  return (
    <Card>
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Col gap={spacing.md}>
            <Col gap={spacing.sm}>
              <Block
                component="h1"
                {...textStyles.heading2}
                color={color.primary}
              >
                Accept invitation
              </Block>

              <Block
                component="p"
                {...textStyles.bodySmall}
                color={color.text.muted}
              >
                Complete your registration to join your team.
              </Block>
            </Col>

            {formState.errors.root && (
              <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
                {formState.errors.root.message}
              </Alert>
            )}

            <FormField>
              <Label htmlFor="invite-email">Email</Label>
              {/* Email is pre-filled from the invitation link and not editable */}
              <Input
                id="invite-email"
                readOnly={true}
                value={email}
                autoComplete="email"
                context="normal"
              />
            </FormField>

            <FormField>
              <Label htmlFor="invite-name">Your name</Label>
              <Input
                id="invite-name"
                autoFocus={true}
                autoComplete="name"
                context={formState.errors.name != null ? 'error' : 'normal'}
                aria-describedby={
                  formState.errors.name ? 'invite-name-error' : undefined
                }
                {...register('name', { required: true })}
              />
              {formState.errors.name && (
                <FormFieldError
                  id="invite-name-error"
                  error={formState.errors.name}
                />
              )}
            </FormField>

            <FormField>
              <Label htmlFor="invite-password">Password</Label>
              <Input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                context={formState.errors.password != null ? 'error' : 'normal'}
                aria-describedby={
                  formState.errors.password
                    ? 'invite-password-error'
                    : undefined
                }
                {...register('password', { required: true })}
              />
              {formState.errors.password && (
                <FormFieldError
                  id="invite-password-error"
                  error={formState.errors.password}
                />
              )}
            </FormField>

            <FormField>
              <Label htmlFor="invite-confirm-password">Confirm password</Label>
              <Input
                id="invite-confirm-password"
                type="password"
                autoComplete="new-password"
                context={
                  formState.errors.confirmedPassword != null
                    ? 'error'
                    : 'normal'
                }
                aria-describedby={
                  formState.errors.confirmedPassword
                    ? 'invite-confirm-password-error'
                    : undefined
                }
                {...register('confirmedPassword', { required: true })}
              />
              {formState.errors.confirmedPassword && (
                <FormFieldError
                  id="invite-confirm-password-error"
                  error={formState.errors.confirmedPassword}
                />
              )}
            </FormField>

            <Button disabled={!formState.isValid || submitting} type="submit">
              Create account
            </Button>
          </Col>
        </form>
      </FormProvider>
    </Card>
  )
}

export default AcceptInvitationRoute
