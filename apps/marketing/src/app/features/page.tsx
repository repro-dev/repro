import type { Metadata } from 'next'

import { HighIntentRoutePage } from '~/components/HighIntentRoutePage'
import routeStyles from '~/components/HighIntentRoutePage.module.css'
import sharedStyles from '~/components/MarketingShell.module.css'

const workflowStages = [
  {
    title: 'Record',
    body: 'Capture the bug while the session is still happening, so the team starts from evidence instead of memory.',
  },
  {
    title: 'Replay',
    body: 'Inspect the session timeline, logs, and network behaviour without asking the reporter to repeat the issue.',
  },
  {
    title: 'Diagnose',
    body: 'Let AI read the evidence, suggest the likely cause, and highlight the next place to look.',
  },
  {
    title: 'Hand off',
    body: 'Package the findings for engineering so the next owner can move straight from diagnosis to fix.',
  },
] as const

const evidenceBands = [
  {
    title: 'Captured evidence keeps the story intact',
    body: 'The route speaks to QA and engineering leads who need the real session, not a templated bug summary.',
  },
  {
    title: 'Replay inspection shortens the back-and-forth',
    body: 'Teams can review the sequence of events, then attach precise notes instead of re-asking for reproduction steps.',
  },
  {
    title: 'Fix handoff stays focused on the next action',
    body: 'The output is built to move the issue into the hands of the person who can ship the fix.',
  },
] as const

export const metadata: Metadata = {
  title: 'Features',
  description:
    'See how Repro turns an ambiguous bug report into recorded evidence, replay inspection, AI diagnosis, and fix handoff.',
}

export default function FeaturesPage() {
  return (
    <HighIntentRoutePage
      kicker="Capture / replay / fix"
      title="Capture-to-fix workflow"
      summary="Start with an ambiguous bug report, capture the session, inspect the replay, let AI diagnose the likely cause, and hand off the fix with less churn."
    >
      <section className={routeStyles.band} aria-labelledby="features-workflow">
        <p className={sharedStyles.sectionKicker}>Workflow</p>

        <h2 id="features-workflow" className={sharedStyles.sectionTitle}>
          From evidence to handoff
        </h2>

        <ol
          className={routeStyles.stepList}
          aria-label="Capture to fix workflow stages"
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
        <p className={sharedStyles.sectionKicker}>What teams get</p>

        <h2 id="features-benefits" className={sharedStyles.sectionTitle}>
          Focused on the work that gets the fix moving
        </h2>

        <div
          className={cx(routeStyles.bandGrid, routeStyles.bandGridThree)}
          role="list"
          aria-label="Feature benefits"
        >
          {evidenceBands.map(band => (
            <article
              key={band.title}
              className={routeStyles.detailCard}
              role="listitem"
            >
              <h3 className={sharedStyles.panelTitle}>{band.title}</h3>

              <p className={sharedStyles.sectionCopy}>{band.body}</p>
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
