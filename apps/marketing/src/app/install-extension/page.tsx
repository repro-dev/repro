import type { Metadata } from 'next'

import { HighIntentRoutePage } from '~/components/HighIntentRoutePage'
import routeStyles from '~/components/HighIntentRoutePage.module.css'
import sharedStyles from '~/components/MarketingShell.module.css'

const installSteps = [
  'Add Repro from the Chrome Web Store in a supported browser.',
  "Sign in and get started with Repro's built-in recording and agentic tools.",
  'Start recording when the bug appears.',
] as const

export const metadata: Metadata = {
  title: 'Install the browser extension',
  description:
    'Install the Repro browser extension, record your first bug, and turn the replay into evidence your team or coding agent can use.',
}

export default function InstallExtensionPage() {
  return (
    <HighIntentRoutePage
      kicker="Browser extension"
      title="Install the Repro browser extension"
      summary="Set up the extension, record your first bug, and give your team or coding agent the replay, logs, and requests needed to fix it faster."
      secondaryCta={{
        href: '/pricing',
        label: 'See pricing',
      }}
    >
      <section className={routeStyles.band} aria-labelledby="install-support">
        <p className={sharedStyles.sectionKicker}>Browser support</p>

        <h2 id="install-support" className={sharedStyles.sectionTitle}>
          Use a supported browser
        </h2>

        <p className={sharedStyles.sectionCopy}>
          Repro works in supported desktop browsers so your team can record the
          bug with the evidence attached.
        </p>
      </section>

      <section className={routeStyles.band} aria-labelledby="install-flow">
        <p className={sharedStyles.sectionKicker}>Setup steps</p>

        <h2 id="install-flow" className={sharedStyles.sectionTitle}>
          Add Repro to your browser
        </h2>

        <ol className={routeStyles.stepList} aria-label="Install steps">
          {installSteps.map((step, index) => (
            <li key={step} className={routeStyles.stepCard}>
              <h3 className={sharedStyles.panelTitle}>{`Step ${index + 1}`}</h3>

              <p className={sharedStyles.sectionCopy}>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        className={routeStyles.band}
        aria-labelledby="install-first-capture"
      >
        <p className={sharedStyles.sectionKicker}>Your first recording</p>

        <h2 id="install-first-capture" className={sharedStyles.sectionTitle}>
          Record the bug before the evidence is lost
        </h2>

        <div className={cx(routeStyles.bandGrid, routeStyles.bandGridTwo)}>
          <article className={routeStyles.detailCard}>
            <h3 className={sharedStyles.panelTitle}>What Repro records</h3>

            <p className={sharedStyles.sectionCopy}>
              Repro records the interactions, errors, requests, and page changes
              behind the bug, so your team can see what happened instead of
              guessing from a summary.
            </p>
          </article>

          <article className={routeStyles.detailCard}>
            <h3 className={sharedStyles.panelTitle}>
              Turn the recording into evidence
            </h3>

            <p className={sharedStyles.sectionCopy}>
              Once the recording is complete, inspect the replay and give your
              team or coding agent the evidence needed to understand, patch, and
              verify the fix.
            </p>
          </article>
        </div>
      </section>

      <section
        className={routeStyles.band}
        aria-labelledby="install-next-steps"
      >
        <p className={sharedStyles.sectionKicker}>After recording</p>

        <h2 id="install-next-steps" className={sharedStyles.sectionTitle}>
          Put the evidence to work
        </h2>

        <div className={cx(routeStyles.bandGrid, routeStyles.bandGridTwo)}>
          <article className={routeStyles.detailCard}>
            <h3 className={sharedStyles.panelTitle}>Review the replay</h3>

            <p className={sharedStyles.sectionCopy}>
              Replay the bug instead of wasting time trying to reproduce it from
              screenshots, logs, and incomplete steps.
            </p>
          </article>

          <article className={routeStyles.detailCard}>
            <h3 className={sharedStyles.panelTitle}>Start from evidence</h3>

            <p className={sharedStyles.sectionCopy}>
              Attach the replay, logs, requests, and interactions so bugs can
              move from reproduction to fix without another round of
              back-and-forth.
            </p>
          </article>
        </div>
      </section>
    </HighIntentRoutePage>
  )
}

function cx(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ')
}
