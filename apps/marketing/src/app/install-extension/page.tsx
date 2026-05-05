import type { Metadata } from 'next'

import { HighIntentRoutePage } from '~/components/HighIntentRoutePage'
import routeStyles from '~/components/HighIntentRoutePage.module.css'
import sharedStyles from '~/components/MarketingShell.module.css'

const installSteps = [
  'Add the extension from the Chrome Web Store on a supported Chromium browser.',
  'Sign in, approve the workspace, and pin Repro where your QA or support team can reach it quickly.',
  'Start a capture from the browser toolbar when the issue appears.',
] as const

const troubleshootingItems = [
  {
    title: 'The browser is not supported',
    body: 'Use a Chromium-based browser for the current install flow, or switch to a supported desktop browser before capturing.',
  },
  {
    title: 'The capture button is inactive',
    body: 'Refresh the page, confirm the extension is enabled, and make sure the workspace sign-in completed successfully.',
  },
  {
    title: 'The session did not record the right moment',
    body: 'Restart the capture before reproducing the bug so the recording begins before the critical interaction.',
  },
] as const

export const metadata: Metadata = {
  title: 'Install the browser extension',
  description:
    'Install the Repro browser extension, start your first capture, and learn what to do when the session needs a sharper handoff.',
}

export default function InstallExtensionPage() {
  return (
    <HighIntentRoutePage
      kicker="Browser capture"
      title="Install the browser extension"
      summary="Set up the extension, capture your first issue, and hand the session off with enough evidence for QA and engineering to act quickly."
      secondaryCta={{
        href: '/pricing',
        label: 'Compare plans',
      }}
    >
      <section className={routeStyles.band} aria-labelledby="install-support">
        <p className={sharedStyles.sectionKicker}>Supported browsers</p>

        <h2 id="install-support" className={sharedStyles.sectionTitle}>
          Use a supported Chromium browser for capture
        </h2>

        <p className={sharedStyles.sectionCopy}>
          The install flow is designed for QA and engineering teams that need a
          fast route from browser setup to recorded evidence.
        </p>
      </section>

      <section className={routeStyles.band} aria-labelledby="install-flow">
        <p className={sharedStyles.sectionKicker}>Install flow</p>

        <h2 id="install-flow" className={sharedStyles.sectionTitle}>
          Install
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
        <p className={sharedStyles.sectionKicker}>First capture</p>

        <h2 id="install-first-capture" className={sharedStyles.sectionTitle}>
          First capture
        </h2>

        <div className={cx(routeStyles.bandGrid, routeStyles.bandGridTwo)}>
          <article className={routeStyles.detailCard}>
            <h3 className={sharedStyles.panelTitle}>What gets recorded</h3>

            <p className={sharedStyles.sectionCopy}>
              The browser session captures the interactions and the surrounding
              evidence so the report can move forward without guesswork.
            </p>
          </article>

          <article className={routeStyles.detailCard}>
            <h3 className={sharedStyles.panelTitle}>What happens next</h3>

            <p className={sharedStyles.sectionCopy}>
              Once the capture is complete, you can inspect the session and hand
              it off to the next owner with a clearer reproduction path.
            </p>
          </article>
        </div>
      </section>

      <section
        className={routeStyles.band}
        aria-labelledby="install-next-steps"
      >
        <p className={sharedStyles.sectionKicker}>Next steps</p>

        <h2 id="install-next-steps" className={sharedStyles.sectionTitle}>
          Next steps
        </h2>

        <div className={cx(routeStyles.bandGrid, routeStyles.bandGridTwo)}>
          <article className={routeStyles.detailCard}>
            <h3 className={sharedStyles.panelTitle}>Inspect the replay</h3>

            <p className={sharedStyles.sectionCopy}>
              Review the captured evidence with the team so the next action is
              obvious before you hand the session off.
            </p>
          </article>

          <article className={routeStyles.detailCard}>
            <h3 className={sharedStyles.panelTitle}>Share the findings</h3>

            <p className={sharedStyles.sectionCopy}>
              Send the session to engineering or support with enough context to
              continue without a second round of reproduction.
            </p>
          </article>
        </div>
      </section>

      <section
        className={routeStyles.band}
        aria-labelledby="install-troubleshooting"
      >
        <p className={sharedStyles.sectionKicker}>Troubleshooting</p>

        <h2 id="install-troubleshooting" className={sharedStyles.sectionTitle}>
          Troubleshooting
        </h2>

        <div
          className={cx(routeStyles.bandGrid, routeStyles.bandGridThree)}
          role="list"
          aria-label="Troubleshooting guidance"
        >
          {troubleshootingItems.map(item => (
            <article
              key={item.title}
              className={routeStyles.detailCard}
              role="listitem"
            >
              <h3 className={sharedStyles.panelTitle}>{item.title}</h3>

              <p className={sharedStyles.sectionCopy}>{item.body}</p>
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
