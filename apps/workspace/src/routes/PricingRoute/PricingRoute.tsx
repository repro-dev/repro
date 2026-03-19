import { Grid } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
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
import React from 'react'

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

function handleSelectPlan(_planId: string) {}

export const PricingRoute: React.FC = () => {
  const apiClient = useApiClient()
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
