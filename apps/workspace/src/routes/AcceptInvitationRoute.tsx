import { zodResolver } from '@hookform/resolvers/zod'
import { Block, Col } from '@jsxstyle/react'
import { useAcceptInvitation, useSession, useSessionLoading } from '@repro/auth'
import {
  Button,
  Card,
  colors,
  FormField,
  FormFieldError,
  Input,
  Label,
} from '@repro/design'
import { logger } from '@repro/logger'
import { fork } from 'fluture'
import React, { useCallback } from 'react'
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

  const methods = useForm<FormState>({
    mode: 'onChange',
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      password: '',
      confirmedPassword: '',
    },
  })

  const { register, formState, handleSubmit, setError } = methods

  const onSubmit = useCallback(
    (data: FormState) => {
      fork<Error>(err => {
        logger.debug('accept invitation failed', err)

        if (err.name === 'NotFoundError' || (err as any).statusCode === 404) {
          setError('root', {
            message:
              'This invitation link is invalid or has expired. Please request a new invitation.',
          })
        } else if (err.name === 'ResourceConflictError') {
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
        navigate('/')
      })(acceptInvitation(invitationToken, data.name, email, data.password))
    },
    [acceptInvitation, invitationToken, email, navigate, setError]
  )

  // If already logged in, show a message with option to go home
  if (!sessionLoading && session !== null) {
    return (
      <Col width={320} alignItems="stretch" gap={10}>
        <Card>
          <Col gap={16}>
            <Block fontSize={15} fontWeight={700} color={colors.blue['700']}>
              Already Signed In
            </Block>

            <Block fontSize={13} lineHeight="1.5em" color={colors.slate['500']}>
              You are already signed in. You can go to your workspace or log out
              first to accept this invitation with a different account.
            </Block>

            <Button onClick={() => navigate('/')}>Go to Workspace</Button>
          </Col>
        </Card>
      </Col>
    )
  }

  // Missing required query params — show an error state
  if (!invitationToken || !email) {
    return (
      <Col width={320} alignItems="stretch" gap={10}>
        <Card>
          <Col gap={16}>
            <Block fontSize={15} fontWeight={700} color={colors.blue['700']}>
              Invalid Invitation Link
            </Block>

            <Block fontSize={13} lineHeight="1.5em" color={colors.slate['500']}>
              This invitation link is missing required information. Please use
              the link from your invitation email.
            </Block>
          </Col>
        </Card>
      </Col>
    )
  }

  return (
    <Col width={320} alignItems="stretch" gap={10}>
      <Card>
        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <Col gap={16}>
              <Col gap={12}>
                <Block
                  fontSize={15}
                  fontWeight={700}
                  color={colors.blue['700']}
                >
                  Accept Invitation
                </Block>

                <Block
                  paddingBottom={10}
                  fontSize={13}
                  lineHeight="1.5em"
                  borderBottom={`1px solid ${colors.slate['200']}`}
                  color={colors.slate['500']}
                >
                  Complete your registration to join your team
                </Block>
              </Col>

              {formState.errors.root && (
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
                  {formState.errors.root.message}
                </Block>
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
                  context={
                    formState.errors.password != null ? 'error' : 'normal'
                  }
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
                <Label htmlFor="invite-confirm-password">
                  Confirm password
                </Label>
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

              <Button
                disabled={!formState.isValid || formState.isSubmitting}
                type="submit"
              >
                Create Account
              </Button>
            </Col>
          </form>
        </FormProvider>
      </Card>
    </Col>
  )
}

export default AcceptInvitationRoute
