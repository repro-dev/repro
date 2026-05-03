import React from 'react'
import routeStyles from './HighIntentMarketingPages.module.css'
import sharedStyles from './MarketingShell.module.css'

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

type HighIntentMarketingPageProps = {
  appUrl: string
}

function PageActions({ appUrl }: HighIntentMarketingPageProps) {
  return (
    <div className={routeStyles.calloutActions}>
      <a
        className={cx(sharedStyles.button, sharedStyles.primaryCta)}
        href={appUrl}
      >
        Get started free
      </a>

      <a
        className={cx(sharedStyles.button, sharedStyles.secondaryCta)}
        href="/"
      >
        Back home
      </a>
    </div>
  )
}

function SectionCard({
  kicker,
  title,
  body,
  spanClassName = sharedStyles.span4,
  children,
}: {
  kicker: string
  title: string
  body: string
  spanClassName?: string
  children?: React.ReactNode
}) {
  return (
    <article className={cx(sharedStyles.cell, spanClassName, routeStyles.card)}>
      <div className={routeStyles.cardHeading}>
        <p className={sharedStyles.sectionKicker}>{kicker}</p>
        <h2 className={sharedStyles.sectionTitle}>{title}</h2>
      </div>

      <p className={sharedStyles.sectionCopy}>{body}</p>

      {children}
    </article>
  )
}

export function FeaturesPageContent({ appUrl }: HighIntentMarketingPageProps) {
  return (
    <div className={routeStyles.page}>
      <section className={cx(sharedStyles.cell, routeStyles.intro)}>
        <p className={sharedStyles.routeKicker}>Capture / replay / fix</p>
        <h1 className={sharedStyles.routeTitle}>
          See the fix path before the guesswork starts
        </h1>
        <p className={sharedStyles.routeCopy}>
          Repro turns an ambiguous report into recorded evidence, a replayable
          session, grounded AI diagnosis, and a clean handoff to the next fix.
        </p>

        <PageActions appUrl={appUrl} />
      </section>

      <section className={routeStyles.grid}>
        <SectionCard
          kicker="1. Capture evidence"
          title="Keep the bug report honest"
          body="Capture the full session, not just the description that arrived with it."
          spanClassName={sharedStyles.span6}
        >
          <ul className={routeStyles.cardList}>
            <li>
              Page interactions stay attached to the timeline that caused them.
            </li>
            <li>
              Console output, network activity, and DOM state travel with the
              session.
            </li>
            <li>
              The report is preserved as recorded evidence instead of a loose
              summary.
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          kicker="2. Replay and inspect"
          title="Trace the problem the way it actually happened"
          body="Step through the recording, compare the sequence, and inspect the break point."
          spanClassName={sharedStyles.span6}
        >
          <ul className={routeStyles.cardList}>
            <li>
              Replay gives the team the same context the user had when the bug
              appeared.
            </li>
            <li>
              Annotated notes make it easier to compare what changed and what
              did not.
            </li>
            <li>
              Evidence stays linked so the same session can support support, QA,
              and engineering.
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          kicker="3. AI diagnosis"
          title="Let AI inspect the evidence, not guess from the ticket"
          body="The agent reads the recording, checks the replay, and explains the likely cause with grounded context."
          spanClassName={sharedStyles.span6}
        >
          <ul className={routeStyles.cardList}>
            <li>
              Diagnosis is tied to recorded evidence and replay inspection.
            </li>
            <li>
              Suggestions stay focused on the observed failure instead of
              generic heuristics.
            </li>
            <li>The output is framed for a human to validate and ship.</li>
          </ul>
        </SectionCard>

        <SectionCard
          kicker="4. Fix handoff"
          title="Hand off the next step with less back-and-forth"
          body="Package the evidence, diagnosis, and notes so the fix owner can move immediately."
          spanClassName={sharedStyles.span6}
        >
          <ul className={routeStyles.cardList}>
            <li>
              The same session can support triage, reproduction, and follow-up.
            </li>
            <li>
              Engineers get enough context to decide whether the issue is code,
              config, or product behaviour.
            </li>
            <li>
              The handoff stays readable for the team that has to ship the
              correction.
            </li>
          </ul>
        </SectionCard>
      </section>

      <section className={cx(sharedStyles.cell, routeStyles.callout)}>
        <p className={sharedStyles.sectionKicker}>Workflow</p>
        <h2 className={sharedStyles.sectionTitle}>
          Capture the bug. Let AI find the fix.
        </h2>
        <p className={sharedStyles.sectionCopy}>
          Built for engineering leads who need a clear path from report to
          evidence to fix, without the pitch-deck language.
        </p>

        <PageActions appUrl={appUrl} />
      </section>
    </div>
  )
}

export function InstallExtensionPageContent({
  appUrl,
}: HighIntentMarketingPageProps) {
  return (
    <div className={routeStyles.page}>
      <section className={cx(sharedStyles.cell, routeStyles.intro)}>
        <p className={sharedStyles.routeKicker}>Browser capture</p>
        <h1 className={sharedStyles.routeTitle}>
          Install the extension and start capturing sessions
        </h1>
        <p className={sharedStyles.routeCopy}>
          Repro runs in Chromium-based browsers so QA and engineering can
          capture the exact session that led to the issue.
        </p>

        <PageActions appUrl={appUrl} />
      </section>

      <section className={routeStyles.supportGrid}>
        <article className={cx(sharedStyles.cell, routeStyles.supportCard)}>
          <p className={sharedStyles.sectionKicker}>Browser support</p>
          <h2 className={sharedStyles.sectionTitle}>
            Works where your team already tests
          </h2>
          <p className={sharedStyles.sectionCopy}>
            Use Repro in Chrome, Edge, and other Chromium-based browsers.
          </p>
        </article>

        <article className={cx(sharedStyles.cell, routeStyles.supportCard)}>
          <p className={sharedStyles.sectionKicker}>Install</p>
          <h2 className={sharedStyles.sectionTitle}>
            Pin the extension and sign in
          </h2>
          <p className={sharedStyles.sectionCopy}>
            Add the extension from the browser store, pin it to the toolbar, and
            sign in with your workspace account.
          </p>
        </article>

        <article className={cx(sharedStyles.cell, routeStyles.supportCard)}>
          <p className={sharedStyles.sectionKicker}>First capture</p>
          <h2 className={sharedStyles.sectionTitle}>
            Start the session, reproduce the bug, save the evidence
          </h2>
          <p className={sharedStyles.sectionCopy}>
            Click capture, reproduce the issue, and stop when the evidence is
            ready to share.
          </p>
        </article>
      </section>

      <section className={routeStyles.grid}>
        <SectionCard
          kicker="What is captured"
          title="Keep the useful context with the recording"
          body="The extension records the signals that help the team explain what happened."
          spanClassName={sharedStyles.span4}
        >
          <ul className={routeStyles.cardList}>
            <li>Page interactions and navigation stay in the event stream.</li>
            <li>
              Console logs, network requests, and DOM state stay attached to the
              session.
            </li>
            <li>
              The captured evidence is meant to support reproduction and triage,
              not just a screenshot.
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          kicker="Next steps"
          title="Move from capture to diagnosis quickly"
          body="Share the recording, inspect it in replay, and hand it off to the fix owner."
          spanClassName={sharedStyles.span4}
        >
          <ul className={routeStyles.cardList}>
            <li>
              Open the session from the workspace after capture completes.
            </li>
            <li>
              Use the replay to confirm the behaviour before a fix is planned.
            </li>
            <li>Hand the evidence to engineering with less back-and-forth.</li>
          </ul>
        </SectionCard>

        <SectionCard
          kicker="Troubleshooting"
          title="If capture does not start, check permissions and refresh"
          body="The most common setup issues are browser permissions or a stale tab state."
          spanClassName={sharedStyles.span4}
        >
          <ul className={routeStyles.cardList}>
            <li>
              Confirm the extension has access to the site you are testing.
            </li>
            <li>Refresh the page and retry the capture if the tab is stale.</li>
            <li>
              Make sure another recording tool is not already owning the page.
            </li>
          </ul>
        </SectionCard>
      </section>

      <section className={cx(sharedStyles.cell, routeStyles.callout)}>
        <p className={sharedStyles.sectionKicker}>Start here</p>
        <h2 className={sharedStyles.sectionTitle}>
          Capture the session, then let the team inspect the evidence.
        </h2>
        <p className={sharedStyles.sectionCopy}>
          The extension is the fastest way to move from a reported issue to a
          replayable, shareable session.
        </p>

        <PageActions appUrl={appUrl} />
      </section>
    </div>
  )
}

export function PricingPageContent({ appUrl }: HighIntentMarketingPageProps) {
  return (
    <div className={routeStyles.page}>
      <section className={cx(sharedStyles.cell, routeStyles.intro)}>
        <p className={sharedStyles.routeKicker}>Billing</p>
        <h1 className={sharedStyles.routeTitle}>
          Pricing that fits the team around the bug
        </h1>
        <p className={sharedStyles.routeCopy}>
          Choose the plan that matches how much capture, collaboration, and AI
          diagnosis your team needs.
        </p>

        <PageActions appUrl={appUrl} />
      </section>

      <section className={routeStyles.grid}>
        <SectionCard
          kicker="Free"
          title="Try the workflow and capture a real session"
          body="For individuals and small teams validating the capture-to-fix loop."
          spanClassName={sharedStyles.span4}
        >
          <div className={routeStyles.planPrice}>$0</div>
          <ul className={routeStyles.cardList}>
            <li>Good for evaluating the recording and replay flow.</li>
            <li>Useful when one person owns the evidence and follow-up.</li>
          </ul>
        </SectionCard>

        <SectionCard
          kicker="Repro+"
          title="Share evidence with a small team"
          body="For teams that need collaboration around captured sessions and guided handoff."
          spanClassName={sharedStyles.span4}
        >
          <div className={routeStyles.planPrice}>$19/user/month</div>
          <ul className={routeStyles.cardList}>
            <li>
              Best when QA, support, and engineering all touch the same issue.
            </li>
            <li>
              Helps a team move from capture to diagnosis without extra process.
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          kicker="Repro++"
          title="Standardize the workflow for larger teams"
          body="For organisations that want more room for shared evidence and team coordination."
          spanClassName={sharedStyles.span4}
        >
          <div className={routeStyles.planPrice}>$49/user/month</div>
          <ul className={routeStyles.cardList}>
            <li>
              Best for teams that need a repeatable path from report to fix.
            </li>
            <li>
              Fits organisations that care about captured evidence as part of
              the support motion.
            </li>
          </ul>
        </SectionCard>
      </section>

      <section className={cx(sharedStyles.cell, routeStyles.callout)}>
        <p className={sharedStyles.sectionKicker}>AI usage</p>
        <h2 className={sharedStyles.sectionTitle}>
          Seats cover the product; AI usage stays honest
        </h2>
        <p className={sharedStyles.sectionCopy}>
          Subscription seats cover the core product and team collaboration. AI
          diagnosis and agentic usage may be metered or subject to final
          included limits, so the plan stays clear without making unsupported
          promises.
        </p>

        <p className={sharedStyles.sectionCopy}>
          Choose Free to evaluate the workflow, Repro+ for shared team usage,
          and Repro++ when the whole organisation needs the same capture-to-fix
          motion.
        </p>

        <PageActions appUrl={appUrl} />
      </section>
    </div>
  )
}
