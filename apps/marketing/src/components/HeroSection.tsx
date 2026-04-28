import { homepageHeroMock } from './marketingShell'

type HeroSectionProps = {
  appUrl: string
}

export function HeroSection({ appUrl }: HeroSectionProps) {
  return (
    <section
      id="hero"
      className="marketing-shell__grid-12 marketing-shell__shell-row marketing-shell__hero-surface"
    >
      <div className="marketing-shell__cell marketing-shell__span-6 marketing-shell__hero-copy">
        <div className="marketing-shell__hero-copy-inner">
          <p className="marketing-shell__hero-eyebrow">
            {homepageHeroMock.eyebrow}
          </p>

          <h1 className="marketing-shell__hero-title">
            {homepageHeroMock.headline}
          </h1>

          <p className="marketing-shell__hero-lede">{homepageHeroMock.lede}</p>
        </div>

        <div className="marketing-shell__hero-cta-row">
          <a className="marketing-shell__primary-cta" href={appUrl}>
            {homepageHeroMock.primaryCta}
          </a>

          <a className="marketing-shell__secondary-cta" href="#features">
            {homepageHeroMock.secondaryCta}
          </a>
        </div>
      </div>

      <div className="marketing-shell__cell marketing-shell__span-6 marketing-shell__hero-mock">
        <div className="marketing-shell__hero-shot-float">
          <div className="marketing-shell__hero-shot-screen">
            <div className="marketing-shell__hero-shot-head">
              <span className="marketing-shell__hero-panel-label">
                {homepageHeroMock.labelRow.left}
              </span>

              <span className="marketing-shell__hero-panel-kicker">
                {homepageHeroMock.labelRow.right}
              </span>
            </div>

            <div className="marketing-shell__grid-4 marketing-shell__hero-shot-grid">
              <article className="marketing-shell__hero-shot-panel marketing-shell__hero-shot-transcript marketing-shell__span-2">
                <span className="marketing-shell__panel-title">Evidence</span>

                <div className="marketing-shell__hero-shot-transcript-rows">
                  {homepageHeroMock.transcriptRows.map(row => (
                    <div
                      key={row.label}
                      className="marketing-shell__hero-shot-row"
                    >
                      <b className="marketing-shell__hero-transcript-label">
                        {row.label}
                      </b>

                      <p className="marketing-shell__hero-transcript-copy">
                        {row.body}
                      </p>
                    </div>
                  ))}
                </div>
              </article>

              {homepageHeroMock.cards.map(card => (
                <article
                  key={card.title}
                  className="marketing-shell__hero-shot-panel marketing-shell__hero-shot-card"
                >
                  <span className="marketing-shell__panel-title">
                    {card.title}
                  </span>

                  <p className="marketing-shell__hero-card-copy">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
