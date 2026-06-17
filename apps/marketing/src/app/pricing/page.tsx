import type { Metadata } from 'next'

import { HighIntentRoutePage } from '~/components/HighIntentRoutePage'
import routeStyles from '~/components/HighIntentRoutePage.module.css'
import sharedStyles from '~/components/MarketingShell.module.css'
import { signupHref } from '~/components/marketingShell'

const tiers = [
  {
    name: 'Free',
    price: '$0/month',
    audience:
      'For individuals testing Repro with 25 saved recordings per month and a $10 one-off AI usage credit.',
    points: [
      'Save up to 25 recordings per month in a personal workspace.',
      "Includes a $10 one-off AI usage credit for trying Repro's agentic debugging tools.",
    ],
    cta: {
      href: signupHref,
      label: 'Get started for free',
    },
  },
  {
    name: 'Growth',
    price: '$29/user/month',
    audience:
      'For teams using replayable bug reports to improve bug burn-down and product quality.',
    points: [
      'Save unlimited recordings across shared team projects.',
      'Includes SDK access, MCP server access, and $10/month AI usage credit per user.',
    ],
    cta: {
      href: signupHref,
      label: 'Get started for free',
    },
  },
  {
    name: 'Scale',
    price: 'Contact us',
    audience:
      'For scale-ups standardising product quality across teams, projects, and longer-lived workflows.',
    points: [
      'Unlimited projects, extended retention, and higher per-user AI usage credit.',
      'Adds onboarding, priority support, and procurement support for larger teams.',
    ],
    cta: {
      href: signupHref,
      label: 'Contact sales',
    },
  },
] as const

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Compare Repro plans for teams that want to reduce bug reproduction time with replayable reports and coding-agent-ready evidence.',
}

export default function PricingPage() {
  return (
    <HighIntentRoutePage
      kicker="Plans for growing teams"
      title="Pricing"
      summary="Start free today. As your product and team grow, Repro scales with the bug-reporting workflow that helps keep quality high."
      secondaryCta={{
        href: '/#how-it-works',
        label: 'See how it works',
      }}
    >
      <section className={routeStyles.band} aria-labelledby="pricing-tiers">
        <p className={sharedStyles.sectionKicker}>Plan options</p>

        <h2 id="pricing-tiers" className={sharedStyles.sectionTitle}>
          Start small, protect quality as you scale
        </h2>

        {/* eslint-disable-next-line react/forbid-elements */}
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
              {/* eslint-disable-next-line react/forbid-elements */}
              <div className={routeStyles.pricingPillRow}>
                {/* eslint-disable-next-line react/forbid-elements */}
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

              <a
                className={cx(
                  sharedStyles.button,
                  sharedStyles.secondaryCta,
                  routeStyles.pricingCta
                )}
                href={tier.cta.href}
              >
                {tier.cta.label}
              </a>
            </article>
          ))}
        </div>
      </section>
    </HighIntentRoutePage>
  )
}

function cx(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ')
}
