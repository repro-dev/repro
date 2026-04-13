import { Grid } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession, useSessionLoading } from '@repro/auth'
import {
  Badge,
  Button,
  Card,
  FullPageError,
  FullPageLoading,
  PageFrame,
  Stack,
  Text,
  color,
  spacing,
} from '@repro/design'
import { BillingPlanWithEntitlements, ListResponse } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useEntitlements } from '~/hooks/useEntitlements'

function collectFeatures(
  plans: Array<BillingPlanWithEntitlements>
): Array<string> {
  const featureSet = new Set<string>()
  for (const plan of plans) {
    for (const entitlement of plan.entitlements) {
      featureSet.add(entitlement.feature)
    }
  }
  return Array.from(featureSet)
}

export const PricingRoute: React.FC = () => {
  const apiClient = useApiClient()
  const session = useSession()
  const sessionLoading = useSessionLoading()
  const navigate = useNavigate()
  const location = useLocation()
  const { entitlements } = useEntitlements()

  // Returns true when the current user has the given feature enabled
  const isEnabled = useCallback(
    (feature: string) =>
      entitlements.some(e => e.feature === feature && e.enabled),
    [entitlements]
  )

  const handleSelectPlan = useCallback(
    (planId: string) => {
      // Guard: if session is not yet resolved, do nothing
      if (sessionLoading) {
        return
      }

      if (!session) {
        // Encode the full destination (including planId) into a single redirect
        // param so planId is preserved after login/register
        const destination = `/pricing?planId=${encodeURIComponent(planId)}`
        navigate(
          `/account/register?redirect=${encodeURIComponent(destination)}`
        )
        return
      }

      // Authenticated: proceed to checkout (wired by REP-127)
      void apiClient
    },
    [apiClient, session, sessionLoading, navigate]
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
    () =>
      apiClient.fetch<ListResponse<BillingPlanWithEntitlements>>(
        '/billing/plans'
      ),
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

  const plans = data!.items
  const features = collectFeatures(plans)

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Plans</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
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

                      return (
                        <Stack key={feature} gap="xs">
                          <Text variant="caption" weight="semibold">
                            {feature}
                          </Text>
                          {entitlement && entitlement.enabled ? (
                            entitlement.limit === null ? (
                              <Badge context="success">Unlimited</Badge>
                            ) : (
                              <Text variant="bodySmall">
                                {entitlement.limit}
                              </Text>
                            )
                          ) : (
                            <Text variant="bodySmall" color={color.text.muted}>
                              Not included
                            </Text>
                          )}
                          {session && isEnabled(feature) && (
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
                  >
                    Get started
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
