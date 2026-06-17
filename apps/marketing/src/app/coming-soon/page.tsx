import type { Metadata } from 'next'

import routeStyles from '~/components/HighIntentRoutePage.module.css'
import sharedStyles from '~/components/MarketingShell.module.css'

export const metadata: Metadata = {
  title: 'Coming soon',
  description:
    'Repro is getting ready for launch. Visit the marketing site to learn how replayable bug reports work in the meantime.',
}

export default function ComingSoonPage() {
  return (
    <section className={routeStyles.routePage}>
      <header className={routeStyles.intro}>
        <p className={sharedStyles.routeKicker}>Launch preview</p>

        <h1 className={sharedStyles.routeTitle}>Coming soon</h1>

        <p className={sharedStyles.routeCopy}>
          Repro is getting ready for launch. We&rsquo;re polishing the product
          and will open the doors soon.
        </p>

        {/* eslint-disable-next-line react/forbid-elements */}
        <div className={routeStyles.actions}>
          <a
            className={`${sharedStyles.button} ${sharedStyles.secondaryCta}`}
            href="/#how-it-works"
          >
            See how it works
          </a>
        </div>
      </header>
    </section>
  )
}
/* eslint-enable */
