import routeStyles from './MarketingRoutePage.module.css'
import {
  routePageContent,
  signupHref,
  type MarketingRouteSlug,
} from './marketingShell'
import sharedStyles from './MarketingShell.module.css'

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

interface MarketingRoutePageProps {
  slug: MarketingRouteSlug
}

export function MarketingRoutePage({ slug }: MarketingRoutePageProps) {
  const page = routePageContent[slug]

  return (
    <section className={routeStyles.routePage}>
      <p className={sharedStyles.routeKicker}>Replayable bug reports</p>

      <h1 className={sharedStyles.routeTitle}>{page.title}</h1>

      <p className={sharedStyles.routeCopy}>{page.body}</p>

      {/* eslint-disable-next-line react/forbid-elements */}
      <div className={routeStyles.routeActions}>
        <a
          className={cx(sharedStyles.button, sharedStyles.primaryCta)}
          href={signupHref}
        >
          Get started for free
        </a>

        <a
          className={cx(sharedStyles.button, sharedStyles.secondaryCta)}
          href="/"
        >
          Back home
        </a>
      </div>
    </section>
  )
}
/* eslint-enable */
