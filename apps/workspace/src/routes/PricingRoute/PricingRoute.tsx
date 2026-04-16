import { Grid } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession, useSessionLoading } from '@repro/auth'
import { useBillingClient } from '@repro/billing'
import {
  Badge,
  Button,
  Card,
  FullPageError,
  FullPageLoading,
  Link,
  PageFrame,
  Stack,
  Text,
  color,
  spacing,
} from '@repro/design'
import { BillingPlanWithEntitlements } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { fork } from 'fluture'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { getEntitlementMeta } from './entitlementMeta'

function collectFeatures(plans: BillingPlanWithEntitlements[]): string[] {
  const featureSet = new Set()
  for (const plan of plans) {
    for (const entitlement of plan.entitlements) {
      featureSet.add(entitlement.feature)
    }
  }
  return Array.from(featureSet) as string[]
}

export const PricingRoute: React.FC = () => {
  const apiClient = useApiClient()
  const billingClient = useBillingClient()
  const session = useSession()
  const sessionLoading = useSessionLoading()
  const navigate = useNavigate()
  const location = useLocation()

  const [loadingPlanId, setLoadingPlanId] = useState(null as string | null)
  const [checkoutError, setCheckoutError] = useState(null as string | null)
  const checkoutInProgressRef = useRef(false)

  // Reset the in-progress guard after React flushes the cleared loading state.
  // This ensures a rapid second click (before the next render) is still blocked
  // even when the underlying Future resolves synchronously.
  useEffect(() => {
    if (loadingPlanId === null) {
      checkoutInProgressRef.current = false
    }
  }, [loadingPlanId])

  const handleSelectPlan = useCallback(
    (planId: string) => {
      if (sessionLoading) {
        return
      }

      if (!session) {
        const destination = `/pricing?planId=${encodeURIComponent(planId)}`
        navigate(
          `/account/register?redirect=${encodeURIComponent(destination)}`
        )
        return
      }

      if (checkoutInProgressRef.current) {
        return
      }

      checkoutInProgressRef.current = true
      setLoadingPlanId(planId)
      setCheckoutError(null)

      apiClient
        .fetch('/billing/checkout', {
          method: 'POST',
          body: JSON.stringify({ planId }),
        })
        .pipe(
          fork((err: Error) => {
            setLoadingPlanId(null)
            setCheckoutError(err.message ?? 'An unexpected error occurred')
          })(result => {
            setLoadingPlanId(null)
            billingClient.openCheckout({ transactionId: result.transactionId })
          })
        )
    },
    [apiClient, billingClient, session, sessionLoading, navigate]
  )

  // When the user returns from login/register with a planId in the URL and is
  // authenticated, auto-trigger checkout for the originally selected plan
  const planIdFromUrl = new URLSearchParams(location.search).get('planId')
  useEffect(() => {
    if (!sessionLoading && session && planIdFromUrl) {
      handleSelectPlan(planIdFromUrl)
    }
  }, [sessionLoading, session, planIdFromUrl, handleSelectPlan])

  const { loading, error, data } = useFuture(
    () => apiClient.fetch('/billing/plans'),
    [apiClient]
  )

  if (loading) {
    return <FullPageLoading />
  }

  if (error) {
    return (
      <FullPageError
        title="Unable to load plans"
        description="Something went wrong while loading the available plans. Please try again later."
      />
    )
  }

  const plans = data!.items as BillingPlanWithEntitlements[]
  const features = collectFeatures(plans)

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Plans</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <Link href="/refund-policy">Refund &amp; cancellation policy</Link>
        {checkoutError && <Text color={color.danger}>{checkoutError}</Text>}
        <Grid
          gridTemplateColumns={`repeat(${plans.length}, 1fr)`}
          gap={spacing['2xl']}
        >
          {plans.map(plan => {
            const entitlementMap = new Map(
              plan.entitlements.map(e => [e.feature, e])
            )

            return (
              <Card key={plan.id}>
                <Stack gap="xl">
                  <Stack gap="sm">
                    <Text variant="heading2">{plan.name}</Text>
                    <Badge context="neutral">
                      {plan.interval === 'month' ? 'Monthly' : 'Yearly'}
                    </Badge>
                  </Stack>

                  <Stack gap="md">
                    {features.map(feature => {
                      const entitlement = entitlementMap.get(feature)
                      const meta = getEntitlementMeta(feature)
                      const formattedValue = meta.valueFormatter(entitlement)

                      return (
                        <Stack key={feature} gap="xs">
                          <Text variant="caption" weight="semibold">
                            {meta.label}
                          </Text>
                          {meta.description && (
                            <Text variant="caption" color={color.text.muted}>
                              {meta.description}
                            </Text>
                          )}
                          <Text
                            variant="bodySmall"
                            color={
                              !entitlement?.enabled
                                ? color.text.muted
                                : undefined
                            }
                          >
                            {formattedValue}
                          </Text>
                          {entitlement?.enabled && session && (
                            <Badge context="info">Active</Badge>
                          )}
                        </Stack>
                      )
                    })}
                  </Stack>

                  <Button
                    variant="contained"
                    context="info"
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={loadingPlanId !== null}
                  >
                    {loadingPlanId === plan.id ? 'Loading…' : 'Get started'}
                  </Button>
                </Stack>
              </Card>
            )
          })}
        </Grid>
      </PageFrame.Body>
    </PageFrame>
  )
}
