'use client'

// jsxstyle requires a client boundary because it injects styles via React context.

import LegalPageShell, {
  LegalParagraph,
  LegalSection,
} from '~/components/LegalPageShell'

export default function RefundPolicyContent() {
  return (
    <LegalPageShell
      title="Refund &amp; Cancellation Policy"
      lastUpdated="April 15, 2026"
    >
      <LegalSection heading="Overview">
        <LegalParagraph>
          We want you to be completely satisfied with Repro. This policy
          explains your rights around cancellations and refunds. If you have any
          questions not answered here, please contact us at{' '}
          <a href="mailto:support@repro.dev">support@repro.dev</a>.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Free Trial">
        <LegalParagraph>
          New accounts begin with a 14-day free trial. No payment information is
          required to start a trial. At the end of the trial period your
          workspace will be paused — no charges will be made unless you choose
          to subscribe. You may cancel at any time during the trial without any
          obligation.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Subscription Cancellation">
        <LegalParagraph>
          You may cancel your Repro subscription at any time from your account
          settings under <strong>Billing → Cancel subscription</strong>, or by
          emailing <a href="mailto:support@repro.dev">support@repro.dev</a>.
        </LegalParagraph>
        <LegalParagraph>
          Cancellation takes effect at the end of the current billing period.
          You will retain full access to your workspace until that date. After
          cancellation your workspace enters a read-only state for 30 days,
          during which you can export your data. After 30 days your data is
          permanently deleted.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Refund Eligibility">
        <LegalParagraph>
          Monthly plans: we offer a full refund if you request it within{' '}
          <strong>14 days</strong> of the charge date and have not used Repro in
          a meaningful way during that period (fewer than 10 recorded sessions).
        </LegalParagraph>
        <LegalParagraph>
          Annual plans: we offer a full refund within <strong>14 days</strong>{' '}
          of the initial purchase. After 14 days, annual plans are not eligible
          for a refund, but you may cancel to prevent future renewals.
        </LegalParagraph>
        <LegalParagraph>
          Renewals (monthly or annual) are non-refundable once the new billing
          period has begun, except where required by applicable law.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="How to Request a Refund">
        <LegalParagraph>
          To request a refund, email{' '}
          <a href="mailto:support@repro.dev">support@repro.dev</a> with the
          subject line <strong>Refund Request</strong>. Please include your
          account email address and the reason for the request. We will respond
          within 2 business days. Approved refunds are typically processed
          within 5-10 business days, depending on your payment provider.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Non-Refundable Items">
        <LegalParagraph>
          The following are not eligible for refunds:
        </LegalParagraph>
        <LegalParagraph>
          Add-on data retention upgrades purchased separately from a
          subscription plan.
        </LegalParagraph>
        <LegalParagraph>
          Charges more than 14 days in the past (except where required by
          applicable law).
        </LegalParagraph>
        <LegalParagraph>
          Accounts that have been suspended for violation of our Terms of
          Service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Contact">
        <LegalParagraph>
          If you have questions about this policy, please reach out to our
          support team at{' '}
          <a href="mailto:support@repro.dev">support@repro.dev</a>. We are happy
          to help.
        </LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  )
}
