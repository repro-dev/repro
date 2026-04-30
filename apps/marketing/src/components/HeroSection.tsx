import heroStyles from './HeroSection.module.css'
import { homepageHeroMock } from './marketingShell'
import sharedStyles from './MarketingShell.module.css'

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

type HeroSectionProps = {
  appUrl: string
}

export function HeroSection({ appUrl }: HeroSectionProps) {
  return (
    <section
      id="hero"
      className={cx(
        sharedStyles.grid12,
        sharedStyles.shellRow,
        heroStyles.heroSurface
      )}
    >
      <div
        className={cx(
          sharedStyles.cell,
          sharedStyles.span6,
          heroStyles.heroCopy
        )}
      >
        <div className={heroStyles.heroCopyInner}>
          <p className={cx(sharedStyles.heroEyebrow, heroStyles.heroEyebrow)}>
            {homepageHeroMock.eyebrow}
          </p>

          <h1 className={sharedStyles.heroTitle}>
            {homepageHeroMock.headline}
          </h1>

          <p className={sharedStyles.heroLede}>{homepageHeroMock.lede}</p>
        </div>

        <div className={heroStyles.heroCtaRow}>
          <a
            className={cx(sharedStyles.button, sharedStyles.primaryCta)}
            href={appUrl}
          >
            {homepageHeroMock.primaryCta}
          </a>

          <a
            className={cx(sharedStyles.button, sharedStyles.secondaryCta)}
            href="#features"
          >
            {homepageHeroMock.secondaryCta}
          </a>
        </div>
      </div>

      <div
        className={cx(
          sharedStyles.cell,
          sharedStyles.span6,
          heroStyles.heroMock
        )}
      >
        <div className={heroStyles.heroShotFloat}>
          <div className={heroStyles.heroShotScreen}>
            <div className={heroStyles.heroShotHead}>
              <span className={sharedStyles.heroPanelLabel}>
                {homepageHeroMock.labelRow.left}
              </span>

              <span className={sharedStyles.heroPanelKicker}>
                {homepageHeroMock.labelRow.right}
              </span>
            </div>

            <div className={cx(sharedStyles.grid4, heroStyles.heroShotGrid)}>
              <article
                className={cx(
                  heroStyles.heroShotPanel,
                  sharedStyles.span2,
                  heroStyles.heroShotTranscript
                )}
              >
                <span className={sharedStyles.panelTitle}>Evidence</span>

                <div className={heroStyles.heroShotTranscriptRows}>
                  {homepageHeroMock.transcriptRows.map(row => (
                    <div key={row.label} className={heroStyles.heroShotRow}>
                      <b className={sharedStyles.heroTranscriptLabel}>
                        {row.label}
                      </b>

                      <p className={sharedStyles.heroTranscriptCopy}>
                        {row.body}
                      </p>
                    </div>
                  ))}
                </div>
              </article>

              {homepageHeroMock.cards.map(card => (
                <article
                  key={card.title}
                  className={cx(
                    heroStyles.heroShotPanel,
                    heroStyles.heroShotCard
                  )}
                >
                  <span className={sharedStyles.panelTitle}>{card.title}</span>

                  <p className={sharedStyles.heroCardCopy}>{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
