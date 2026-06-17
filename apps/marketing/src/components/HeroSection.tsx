import heroStyles from './HeroSection.module.css'
import { homepageHeroMock, signupHref } from './marketingShell'
import sharedStyles from './MarketingShell.module.css'
/* eslint-disable @repro/oxlint-plugin-design/no-classname-prop */

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

export function HeroSection() {
  return (
    <section
      id="hero"
      className={cx(sharedStyles.grid12, heroStyles.heroSurface)}
    >
      {/* eslint-disable-next-line react/forbid-elements */}
      <div
        className={cx(
          sharedStyles.cell,
          sharedStyles.span6,
          heroStyles.heroCopy
        )}
      >
        {/* eslint-disable-next-line react/forbid-elements */}
        <div className={heroStyles.heroCopyInner}>
          <p className={cx(sharedStyles.heroEyebrow, heroStyles.heroEyebrow)}>
            {homepageHeroMock.eyebrow}
          </p>

          <h1 className={sharedStyles.heroTitle}>
            {homepageHeroMock.headline}
          </h1>

          <p className={sharedStyles.heroLede}>{homepageHeroMock.lede}</p>
        </div>

        {/* eslint-disable-next-line react/forbid-elements */}
        <div className={heroStyles.heroCtaRow}>
          <a
            className={cx(sharedStyles.button, sharedStyles.primaryCta)}
            href={signupHref}
          >
            {homepageHeroMock.primaryCta}
          </a>

          <a
            className={cx(sharedStyles.button, sharedStyles.secondaryCta)}
            href="#how-it-works"
          >
            {homepageHeroMock.secondaryCta}
          </a>
        </div>
      </div>

      {/* eslint-disable-next-line react/forbid-elements */}
      <div
        className={cx(
          sharedStyles.cell,
          sharedStyles.span6,
          heroStyles.heroMock
        )}
      >
        {/* eslint-disable-next-line react/forbid-elements */}
        <div className={heroStyles.heroShotFloat}>
          {/* eslint-disable-next-line react/forbid-elements */}
          <div className={heroStyles.heroShotScreen}>
            <img
              alt="Repro session inspector showing a captured bug report with replay, logs, and request details"
              className={heroStyles.heroShotImage}
              height={1634}
              src="/homepage-screenshot.png"
              width={2496}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
/* eslint-enable */
