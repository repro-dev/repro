import { useApiClient } from '@repro/api-client'
import { Alert, Button, Card, colors } from '@repro/design'
import { BillingEntitlement, BillingPlanWithEntitlements, ListPlansResponse } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { Block, Col, Grid, InlineBlock, Row } from '@jsxstyle/react'
import React from 'react'
import { Loading } from '~/components/Loading'

function formatLimit(entitlement: BillingEntitlement): string {
  if (!entitlement.enabled) return 'Not included'
  if (entitlement.limit === null) return 'Unlimited'
  return String(entitlement.limit)
}

function formatFeatureName(feature: string): string {
  return feature.charAt(0).toUpperCase() + feature.slice(1)
}

function collectFeatures(plans: Array<BillingPlanWithEntitlements>): Array<string> {
  const seen = new Set<string>()
  for (const plan of plans) {
    for (const entitlement of plan.entitlements) {
      seen.add(entitlement.feature)
    }
  }
  return Array.from(seen)
}

function getEntitlement(
  plan: BillingPlanWithEntitlements,
  feature: string
): BillingEntitlement {
  return (
    plan.entitlements.find(e => e.feature === feature) ?? {
      feature,
      enabled: false,
      limit: null,
    }
  )
}

interface PlanCardProps {
  plan: BillingPlanWithEntitlements
  features: Array<string>
  onSelectPlan: (planId: string) => void
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, features, onSelectPlan }) => (
  <Card>
    <Col gap={20}>
      <Col gap={4}>
        <Block fontSize={18} fontWeight={700} color={colors.slate['800']}>
          {plan.name}
        </Block>
        <InlineBlock
          fontSize={12}
          color={colors.slate['500']}
          textTransform="uppercase"
          letterSpacing="0.05em"
        >
          {plan.interval === 'month' ? 'Monthly' : 'Annual'}
        </InlineBlock>
      </Col>

      <Col gap={8}>
        {features.map(feature => {
          const entitlement = getEntitlement(plan, feature)
          return (
            <Row key={feature} justifyContent="space-between" gap={16}>
              <Block fontSize={14} color={colors.slate['600']}>
                {formatFeatureName(feature)}
              </Block>
              <Block
                fontSize={14}
                fontWeight={600}
                color={entitlement.enabled ? colors.blue['700'] : colors.slate['400']}
              >
                {formatLimit(entitlement)}
              </Block>
            </Row>
          )
        })}
      </Col>

      <Button onClick={() => onSelectPlan(plan.id)}>Get started</Button>
    </Col>
  </Card>
)

const PricingRoute: React.FC = () => {
  const apiClient = useApiClient()

  const { loading, error, result: response } = useFuture(
    () => apiClient.fetch<ListPlansResponse>('/billing/plans'),
    [apiClient]
  )

  if (loading) {
    return (
      <Row alignItems="center" justifyContent="center" height={200}>
        <Loading />
      </Row>
    )
  }

  if (error || !response) {
    return (
      <Row alignItems="center" justifyContent="center" padding={40}>
        <Block maxWidth={400} width="100%">
          <Alert type="danger">Failed to load pricing plans. Please try again later.</Alert>
        </Block>
      </Row>
    )
  }

  const plans = response.items
  const features = collectFeatures(plans)

  function handleSelectPlan(planId: string) {
    // Checkout CTA — wired up in REP-127
    void planId
  }

  return (
    <Col gap={40} padding={40} maxWidth={960} marginH="auto">
      <Col gap={8} alignItems="center">
        <Block fontSize={32} fontWeight={700} color={colors.slate['800']}>
          Simple, transparent pricing
        </Block>
        <Block fontSize={16} color={colors.slate['500']}>
          Choose the plan that works for your team.
        </Block>
      </Col>

      <Grid
        gridTemplateColumns={`repeat(${plans.length}, 1fr)`}
        gap={20}
        alignItems="start"
      >
        {plans.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            features={features}
            onSelectPlan={handleSelectPlan}
          />
        ))}
      </Grid>
    </Col>
  )
}

export default PricingRoute
