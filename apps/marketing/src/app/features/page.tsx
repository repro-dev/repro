import type { Metadata } from 'next'

import { HighIntentRoutePage } from '~/components/HighIntentRoutePage'
import routeStyles from '~/components/HighIntentRoutePage.module.css'
import sharedStyles from '~/components/MarketingShell.module.css'

const workflowStages = [
  {
    title: 'Record',
    body: 'Record the bug while it is happening, including the interactions, errors, requests, and DOM changes your team needs to start from evidence instead of guesswork.',
  },
  {
    title: 'Replay',
    body: 'See what happened, with a full timeline of logs, network activity, and interactions. No need to reproduce the bug again.',
  },
  {
    title: 'Find the cause',
    body: 'Use the recorded evidence to identify likely causes before your coding agent starts changing code.',
  },
  {
    title: 'Fix',
    body: "Fix with confidence from the recorded evidence. Repro's MCP server lets your coding agent inspect the recording directly.",
  },
] as const

const evidenceBands = [
  {
    title: 'A replayable report keeps the evidence attached to the bug.',
  },
  {
    title: 'No more chasing logs, screenshots, and steps to reproduce.',
  },
] as const

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'See how Repro records the interactions, errors, network requests, and changes behind a bug so teams can fix it faster.',
}

export default function FeaturesPage() {
  return (
    <HighIntentRoutePage
      kicker="From recording to resolution"
      title="How Repro records the evidence behind a bug"
      summary="Record the reproduction once, then inspect the replay, logs, requests, and changes that show what happened and help your team fix it faster."
    >
      <section className={routeStyles.band} aria-labelledby="features-workflow">
        <p className={sharedStyles.sectionKicker}>The recording workflow</p>

        <h2 id="features-workflow" className={sharedStyles.sectionTitle}>
          From repro to fix
        </h2>

        <ol
          className={routeStyles.stepList}
          aria-label="Reproduction to fix workflow stages"
        >
          {workflowStages.map(stage => (
            <li key={stage.title} className={routeStyles.stepCard}>
              <h3 className={sharedStyles.panelTitle}>{stage.title}</h3>

              <p className={sharedStyles.sectionCopy}>{stage.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={routeStyles.band} aria-labelledby="features-benefits">
        <p className={sharedStyles.sectionKicker}>Why it matters</p>

        <h2 id="features-benefits" className={sharedStyles.sectionTitle}>
          Spend less time reproducing bugs. Start from recorded evidence.
        </h2>

        <div
          className={cx(routeStyles.bandGrid, routeStyles.bandGridTwo)}
          role="list"
          aria-label="Repro benefits"
        >
          {evidenceBands.map(band => (
            <article
              key={band.title}
              className={routeStyles.detailCard}
              role="listitem"
            >
              <h3 className={sharedStyles.panelTitle}>{band.title}</h3>
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
