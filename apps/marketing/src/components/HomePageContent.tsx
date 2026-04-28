import { HeroSection } from './HeroSection'
import homeStyles from './HomePageContent.module.css'
import { homepageNarrativeCards, homepageProofCards } from './marketingShell'
import sharedStyles from './MarketingShell.module.css'

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

const proofMarkerStyles = {
  danger: homeStyles.proofMarkerDanger,
  info: homeStyles.proofMarkerInfo,
  success: homeStyles.proofMarkerSuccess,
  warning: homeStyles.proofMarkerWarning,
} as const

type HomePageContentProps = {
  appUrl: string
}

export function HomePageContent({ appUrl }: HomePageContentProps) {
  return (
    <div className={homeStyles.homeContent}>
      <HeroSection appUrl={appUrl} />

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
        id="features"
        className={cx(sharedStyles.grid12, sharedStyles.shellRow)}
      >
        {homepageNarrativeCards.map(card => (
          <article
            key={card.title}
            className={cx(
              sharedStyles.cell,
              sharedStyles.span4,
              homeStyles.storyCard
            )}
          >
            <p className={sharedStyles.sectionKicker}>{card.kicker}</p>

            <h2 className={sharedStyles.sectionTitle}>{card.title}</h2>

            <p className={sharedStyles.sectionCopy}>{card.body}</p>
          </article>
        ))}
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
          <p className={sharedStyles.sectionKicker}>Closing CTA</p>

          <h2 className={sharedStyles.sectionTitle}>
            Capture the bug. Let AI find the fix.
          </h2>

          <div className={homeStyles.closingActions}>
            <a
              className={cx(sharedStyles.button, sharedStyles.primaryCta)}
              href={appUrl}
            >
              Start free
            </a>

            <a
              className={cx(sharedStyles.button, sharedStyles.secondaryCta)}
              href="#features"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
