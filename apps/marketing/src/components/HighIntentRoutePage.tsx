import type { ReactNode } from 'react'

import routeStyles from './HighIntentRoutePage.module.css'
import sharedStyles from './MarketingShell.module.css'
import { signupHref } from './marketingShell'

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

type HighIntentRoutePageProps = {
  kicker: string
  title: string
  summary: string
  children: ReactNode
  secondaryCta?: {
    href: string
    label: string
  }
}

export function HighIntentRoutePage({
  kicker,
  title,
  summary,
  children,
  secondaryCta,
}: HighIntentRoutePageProps) {
  return (
    <section className={routeStyles.routePage}>
      <header className={routeStyles.intro}>
        <p className={sharedStyles.routeKicker}>{kicker}</p>

        <h1 className={sharedStyles.routeTitle}>{title}</h1>

        <p className={sharedStyles.routeCopy}>{summary}</p>

        {/* eslint-disable-next-line react/forbid-elements */}
        <div className={routeStyles.actions}>
          <a
            className={cx(sharedStyles.button, sharedStyles.primaryCta)}
            href={signupHref}
          >
            Get started for free
          </a>

          {secondaryCta ? (
            <a
              className={cx(sharedStyles.button, sharedStyles.secondaryCta)}
              href={secondaryCta.href}
            >
              {secondaryCta.label}
            </a>
          ) : null}
        </div>
      </header>

      {/* eslint-disable-next-line react/forbid-elements */}
      <div className={routeStyles.body}>{children}</div>
    </section>
  )
}
/* eslint-enable */
