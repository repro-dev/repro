import { HeroSection } from './HeroSection'
import { homepageNarrativeCards, homepageProofCards } from './marketingShell'

type HomePageContentProps = {
  appUrl: string
}

export function HomePageContent({ appUrl }: HomePageContentProps) {
  return (
    <div className="marketing-shell__home-content">
      <HeroSection appUrl={appUrl} />

      <section className="marketing-shell__grid-12 marketing-shell__shell-row marketing-shell__proof-strip">
        {homepageProofCards.map(card => (
          <article
            key={card.body}
            className="marketing-shell__cell marketing-shell__span-3 marketing-shell__proof-card"
          >
            <span
              className={`marketing-shell__proof-marker marketing-shell__proof-marker--${card.tone}`}
            />

            <p className="marketing-shell__proof-copy">{card.body}</p>
          </article>
        ))}
      </section>

      <section
        id="features"
        className="marketing-shell__grid-12 marketing-shell__shell-row"
      >
        {homepageNarrativeCards.map(card => (
          <article
            key={card.title}
            className="marketing-shell__cell marketing-shell__span-4 marketing-shell__section marketing-shell__story-card"
          >
            <p className="marketing-shell__section-kicker">{card.kicker}</p>

            <h2 className="marketing-shell__section-title marketing-shell__story-title">
              {card.title}
            </h2>

            <p className="marketing-shell__section-copy">{card.body}</p>
          </article>
        ))}
      </section>

      <section
        id="signup"
        className="marketing-shell__cell marketing-shell__shell-row marketing-shell__closing-cta"
      >
        <div className="marketing-shell__closing-inner">
          <p className="marketing-shell__section-kicker">Closing CTA</p>

          <h2 className="marketing-shell__section-title marketing-shell__closing-title">
            Capture the bug. Let AI find the fix.
          </h2>

          <div className="marketing-shell__closing-actions">
            <a className="marketing-shell__primary-cta" href={appUrl}>
              Start free
            </a>

            <a className="marketing-shell__secondary-cta" href="#features">
              See how it works
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
