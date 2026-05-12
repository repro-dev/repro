import { HeroSection } from './HeroSection'
import routeStyles from './HighIntentRoutePage.module.css'
import homeStyles from './HomePageContent.module.css'
import { homepageProofCards } from './marketingShell'
import sharedStyles from './MarketingShell.module.css'

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

const proofMarkerStyles = {
  danger: homeStyles.proofMarkerDanger,
  info: homeStyles.proofMarkerInfo,
  success: homeStyles.proofMarkerSuccess,
  warning: homeStyles.proofMarkerWarning,
} as const

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

export function HomePageContent() {
  return (
    <div className={homeStyles.homeContent}>
      <HeroSection />

      <section
        className={cx(
          sharedStyles.grid12,
          sharedStyles.shellRow,
          homeStyles.proofStrip
        )}
      >
        {homepageProofCards.map(card => (
          <article
            key={card.body}
            className={cx(
              sharedStyles.cell,
              sharedStyles.span3,
              homeStyles.proofCard
            )}
          >
            <span
              className={cx(
                homeStyles.proofMarker,
                proofMarkerStyles[card.tone]
              )}
            />

            <p className={sharedStyles.proofCopy}>{card.body}</p>
          </article>
        ))}
      </section>

      <section
        id="how-it-works"
        className={cx(
          sharedStyles.shellRow,
          routeStyles.band,
          homeStyles.workflowSection
        )}
        aria-labelledby="how-it-works-title"
      >
        <p
          className={cx(sharedStyles.sectionKicker, homeStyles.workflowKicker)}
        >
          The recording workflow
        </p>

        <h2
          id="how-it-works-title"
          className={cx(sharedStyles.sectionTitle, homeStyles.workflowTitle)}
        >
          From repro to fix
        </h2>

        <ol
          className={routeStyles.stepList}
          aria-label="Reproduction to fix workflow stages"
        >
          {workflowStages.map((stage, index) => (
            <li key={stage.title} className={routeStyles.stepCard}>
              <span className={routeStyles.stepNumber}>{index + 1}</span>

              <h3 className={routeStyles.stepTitle}>{stage.title}</h3>

              <p className={routeStyles.stepBody}>{stage.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="signup"
        className={cx(
          sharedStyles.cell,
          sharedStyles.shellRow,
          homeStyles.closingCta
        )}
      >
        <div className={homeStyles.closingInner}>
          <h2 className={sharedStyles.sectionTitle}>
            Record the bug. Let AI find the fix.
          </h2>

          <div className={homeStyles.closingActions}>
            <a
              className={cx(sharedStyles.button, sharedStyles.primaryCta)}
              href="/coming-soon"
            >
              Get started for free
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
