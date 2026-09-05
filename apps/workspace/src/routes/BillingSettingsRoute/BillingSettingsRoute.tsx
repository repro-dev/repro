import { Col, Row } from '@jsxstyle/react'
import { ApiClient, useApiClient } from '@repro/api-client'
import {
  Alert,
  Button,
  Card,
  FullPageLoading,
  PageFrame,
  Stack,
  Text,
  color,
  spacing,
  useConfirm,
} from '@repro/design'
import type {
  BillingPlanWithEntitlements,
  BillingSubscriptionResponse,
} from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { fork, map } from 'fluture'
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// --- Default API functions (injectable for testing) ---

function defaultGetSubscription(apiClient: ApiClient) {
  return apiClient.fetch('/billing/subscription')
}

function defaultGetPlans(apiClient: ApiClient) {
  return apiClient
    .fetch('/billing/plans')
    .pipe(map((res: { items: BillingPlanWithEntitlements[] }) => res.items))
}

function defaultCancelSubscription(apiClient: ApiClient) {
  return apiClient.fetch('/billing/cancel', {
    method: 'post',
  })
}

function defaultOpenPortal(apiClient: ApiClient) {
  return apiClient.fetch('/billing/portal', { method: 'post' })
}

// --- Props ---

interface BillingSettingsRouteProps {
  // Injectable for testing; defaults are real implementations above
  getSubscription?: typeof defaultGetSubscription
  getPlans?: typeof defaultGetPlans
  cancelSubscription?: typeof defaultCancelSubscription
  openPortal?: typeof defaultOpenPortal
}

// --- Pure, testable component ---

export function BillingSettingsRoute({
  getSubscription = defaultGetSubscription,
  getPlans = defaultGetPlans,
  cancelSubscription = defaultCancelSubscription,
  openPortal = defaultOpenPortal,
}: BillingSettingsRouteProps) {
  const apiClient = useApiClient()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const handleUpgrade = useCallback(() => {
    navigate('/pricing')
  }, [navigate])

  const {
    loading: subLoading,
    data: fetchedSub,
    error: subError,
  } = useFuture(() => getSubscription(apiClient), [apiClient, getSubscription])

  const {
    loading: plansLoading,
    data: plans,
    error: plansError,
  } = useFuture(() => getPlans(apiClient), [apiClient, getPlans])

  // Local mutable copy — updated optimistically after cancel succeeds
  const [subscription, setSubscription] =
    useState<BillingSubscriptionResponse | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    if (fetchedSub) {
      setSubscription(fetchedSub)
    }
  }, [fetchedSub])

  const handleCancel = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Cancel Subscription',
      description:
        'Your subscription will remain active until the end of the current billing period.',
      confirmLabel: 'Cancel Subscription',
      variant: 'destructive',
    })

    if (!confirmed) {
      return
    }

    setCancelError(null)
    setCancelLoading(true)
    cancelSubscription(apiClient).pipe(
      fork(() => {
        setCancelError('Failed to cancel subscription. Please try again.')
        setCancelLoading(false)
      })(updatedSub => {
        setSubscription(updatedSub)
        setCancelLoading(false)
      })
    )
  }, [apiClient, cancelSubscription, confirm])

  const handlePortal = useCallback(() => {
    setPortalError(null)
    setPortalLoading(true)
    openPortal(apiClient).pipe(
      fork(() => {
        setPortalError('Failed to open billing portal. Please try again.')
        setPortalLoading(false)
      })(({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer')
        setPortalLoading(false)
      })
    )
  }, [apiClient, openPortal])

  if (subLoading || plansLoading) {
    return <FullPageLoading />
  }

  if (subError) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Billing</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Alert type="danger">
            Failed to load subscription. Please try refreshing the page.
          </Alert>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  if (plansError) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Billing</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Alert type="danger">
            Failed to load plans. Please try refreshing the page.
          </Alert>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  const currentPlan = (plans ?? []).find(
    (p: BillingPlanWithEntitlements) => p.id === subscription?.planId
  )
  // Free-plan detection is name-based: the Free plan has no paid period, so
  // period/renewal/cancel state is hidden and the upgrade path is the primary
  // action (REP-1642).
  const isFreePlan = currentPlan?.name === 'Free'
  const hasPaidSubscription = subscription != null && !isFreePlan
  const planDisplayName = currentPlan?.name ?? subscription?.planId ?? 'Free'
  // Only Paddle-managed subs (isSelfProvisioned: false) expose cancel + portal
  const isPaddleManaged =
    subscription != null && !subscription.isSelfProvisioned
  const canCancel =
    isPaddleManaged &&
    subscription!.status === 'active' &&
    !subscription!.cancelAtPeriodEnd

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Billing</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body maxWidth={720}>
        <Stack gap={spacing.lg}>
          {subscription?.status === 'past_due' && (
            <Alert type="warning">
              Your payment is past due. Please update your payment method to
              avoid service interruption.
            </Alert>
          )}

          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Text variant="heading3">Current Plan</Text>
              <Text variant="body">{planDisplayName}</Text>
              {subscription != null && (
                <Text variant="body" color={color.text.muted}>
                  Status: {subscription.status}
                </Text>
              )}
              {hasPaidSubscription && (
                <Text variant="body" color={color.text.muted}>
                  Billing period:{' '}
                  {`${new Date(
                    subscription.currentPeriodStart
                  ).toLocaleDateString()} \u2013 ${new Date(
                    subscription.currentPeriodEnd
                  ).toLocaleDateString()}`}
                </Text>
              )}
              {subscription != null &&
                hasPaidSubscription &&
                !subscription.cancelAtPeriodEnd && (
                  <Text variant="body" color={color.text.muted}>
                    Renews on{' '}
                    {new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString()}
                  </Text>
                )}
              {subscription?.cancelAtPeriodEnd && (
                <Text variant="body" color={color.text.muted}>
                  Cancels at end of period (
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  )
                </Text>
              )}
              {!hasPaidSubscription && (
                <Row gap={spacing.md}>
                  <Button variant="contained" onClick={handleUpgrade}>
                    Upgrade plan
                  </Button>
                </Row>
              )}
            </Col>
          </Card>

          {isPaddleManaged && (
            <Card>
              <Col padding={spacing.xl} gap={spacing.lg}>
                <Text variant="heading3">Manage Subscription</Text>

                {cancelError && <Alert type="danger">{cancelError}</Alert>}
                {portalError && <Alert type="danger">{portalError}</Alert>}

                <Row gap={spacing.md}>
                  {canCancel && (
                    <Button
                      variant="outlined"
                      context="danger"
                      onClick={handleCancel}
                      disabled={cancelLoading}
                    >
                      Cancel Subscription
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    onClick={handlePortal}
                    disabled={portalLoading}
                  >
                    Manage billing
                  </Button>
                </Row>
              </Col>
            </Card>
          )}
        </Stack>
      </PageFrame.Body>
    </PageFrame>
  )
}

/**
 * Connected wrapper — sources apiClient from context. No additional props
 * are needed because the server determines the account from the JWT.
 */
export function BillingSettingsRouteConnected() {
  return <BillingSettingsRoute />
}
