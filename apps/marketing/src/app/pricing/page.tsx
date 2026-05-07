import type { Metadata } from 'next'

import { HighIntentRoutePage } from '~/components/HighIntentRoutePage'
import routeStyles from '~/components/HighIntentRoutePage.module.css'
import sharedStyles from '~/components/MarketingShell.module.css'

const tiers = [
  {
    name: 'Free',
    price: '$0/month',
    audience: 'For individuals trying Repro on a real issue.',
    points: [
      'Capture a session and review the replay.',
      'Use the basic workflow to understand the issue before you scale up.',
    ],
  },
  {
    name: 'Repro+',
    price: '$19/user/month',
    audience:
      'For engineers and QA teams that need richer evidence and AI diagnosis.',
    points: [
      'Add more structure to the evidence trail.',
      'Keep the core capture-to-diagnose workflow available to each user.',
    ],
  },
  {
    name: 'Repro++',
    price: '$49/user/month',
    audience:
      'For teams that need shared projects, SDK/reporting flow support, retention controls, handoff support, and collaboration.',
    points: [
      'Coordinate across the people who file and fix the issue.',
      'Use the shared workflow when the team needs a broader operating lane with SDK/reporting flow support and retention controls.',
    ],
  },
] as const

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Compare Free, Repro+, and Repro++ plans for teams that need captured evidence, replay inspection, AI diagnosis, and fix handoff.',
}

export default function PricingPage() {
  return (
    <HighIntentRoutePage
      kicker="Simple plans"
      title="Pricing"
      summary="Choose the plan that matches how your team captures evidence, inspects replays, and hands the fix forward."
      secondaryCta={{
        href: '/features',
        label: 'See the workflow',
      }}
    >
      <section className={routeStyles.band} aria-labelledby="pricing-tiers">
        <p className={sharedStyles.sectionKicker}>Plans</p>

        <h2 id="pricing-tiers" className={sharedStyles.sectionTitle}>
          Three tiers with clear buyer guidance
        </h2>

        <div
          className={cx(routeStyles.bandGrid, routeStyles.bandGridThree)}
          role="list"
          aria-label="Pricing tiers"
        >
          {tiers.map(tier => (
            <article
              key={tier.name}
              className={routeStyles.pricingCard}
              role="listitem"
            >
              <div className={routeStyles.pricingPillRow}>
                <span className={routeStyles.pricingPill}>{tier.name}</span>
              </div>

              <p className={routeStyles.pricingValue}>{tier.price}</p>

              <p className={sharedStyles.sectionCopy}>{tier.audience}</p>

              <ul
                className={routeStyles.detailList}
                aria-label={`${tier.name} features`}
              >
                {tier.points.map(point => (
                  <li key={point} className={sharedStyles.sectionCopy}>
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={routeStyles.band} aria-labelledby="pricing-guidance">
        <p className={sharedStyles.sectionKicker}>Buyer guidance</p>

        <h2 id="pricing-guidance" className={sharedStyles.sectionTitle}>
          Keep the pricing story grounded in the product reality
        </h2>

        <p className={routeStyles.supportNote}>
          AI usage details are not expressed as fixed quotas here, and the plan
          copy avoids unsupported overage language, credit bundles, or claims
          that have not been finalized.
        </p>
      </section>
    </HighIntentRoutePage>
  )
}

function cx(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ')
}
