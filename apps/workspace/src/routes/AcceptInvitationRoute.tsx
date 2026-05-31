import { zodResolver } from '@hookform/resolvers/zod'
import { Block, Col } from '@jsxstyle/react'
import { useAcceptInvitation, useSession, useSessionLoading } from '@repro/auth'
import {
  Alert,
  Button,
  Card,
  color,
  spacing,
  TextField,
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

            <TextField
              label="Email"
              id="invite-email"
              readOnly
              value={email}
              autoComplete="email"
            />

            <TextField
              label="Your name"
              id="invite-name"
              autoFocus
              autoComplete="name"
              invalid={!!formState.errors.name}
              error={formState.errors.name}
              {...register('name', { required: true })}
            />

            <TextField
              label="Password"
              id="invite-password"
              type="password"
              autoComplete="new-password"
              invalid={!!formState.errors.password}
              error={formState.errors.password}
              {...register('password', { required: true })}
            />

            <TextField
              label="Confirm password"
              id="invite-confirm-password"
              type="password"
              autoComplete="new-password"
              invalid={!!formState.errors.confirmedPassword}
              error={formState.errors.confirmedPassword}
              {...register('confirmedPassword', { required: true })}
            />

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
