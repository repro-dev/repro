'use client'

import LegalPageShell, {
  LegalParagraph,
  LegalSection,
} from '~/components/LegalPageShell'

// Last updated date — update whenever the policy content changes.
const LAST_UPDATED = 'April 15, 2026'

export function PrivacyPolicy() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="Introduction">
        <LegalParagraph>
          Repro (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates
          the Repro bug-reporting platform, including the Repro website at
          repro.dev, the Repro web application, and the Repro Chrome extension
          (collectively, the &quot;Service&quot;). This Privacy Policy explains
          how we collect, use, share, and protect information about you when you
          use our Service.
        </LegalParagraph>
        <LegalParagraph>
          By using the Service you agree to the collection and use of
          information in accordance with this policy. If you do not agree with
          any part of this policy, please do not use the Service.
        </LegalParagraph>
        <LegalParagraph>
          If you are located in the European Economic Area (EEA) or the United
          Kingdom, the data controller responsible for your personal data is
          Repro Ltd. Our lawful basis for processing personal data is: (a)
          performance of a contract when we provide the Service to you; (b) your
          consent for analytics and marketing cookies; and (c) our legitimate
          interests in operating, improving, and securing the Service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Information We Collect">
        <LegalParagraph>
          We collect information you provide directly to us, such as your name,
          email address, and billing information when you register for an
          account or purchase a subscription.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Recording data.</strong> Repro captures browser session
          recordings on behalf of your organisation. A recording may include DOM
          snapshots (the visual state of the page), user interactions (mouse
          clicks, keyboard input, scroll position), network requests and
          responses made by the page, console output, and JavaScript errors.
          Sensitive input fields (passwords, credit card numbers) are masked
          before capture. You are responsible for configuring the SDK to mask
          any additional fields that may contain personal data relevant to your
          users.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Chrome extension permissions.</strong> The Repro Chrome
          extension requests access to the active tab in order to inject the
          recording SDK, and to browser storage in order to persist your
          authentication token. The extension does not read your browsing
          history, bookmarks, or data from any tab other than the one you
          explicitly activate recording on.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Usage and analytics data.</strong> We automatically collect
          certain technical information when you use the Service, including your
          IP address, browser type and version, operating system, referring
          URLs, pages visited, and timestamps. We use Mixpanel to process
          product analytics events. Mixpanel may set cookies and collect similar
          data as described in the Mixpanel Privacy Policy.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="How We Use Information">
        <LegalParagraph>
          We use the information we collect to provide, maintain, and improve
          the Service; process transactions and send you related information
          (e.g. purchase confirmations, invoices); send you technical notices,
          updates, security alerts, and support messages; respond to your
          comments and questions; and detect and prevent fraudulent or abusive
          use of the Service.
        </LegalParagraph>
        <LegalParagraph>
          Recording data is processed solely to provide the bug-reporting
          features of the Service to you and your organisation. We do not use
          the content of session recordings for advertising or to build profiles
          about individual end-users of your application.
        </LegalParagraph>
        <LegalParagraph>
          With your consent, we may send you marketing communications about
          Repro features, product updates, and related offerings. You can
          opt-out at any time by clicking the unsubscribe link in any marketing
          email or by contacting us.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Data Sharing">
        <LegalParagraph>
          We do not sell your personal data. We share your information only in
          the following circumstances:
        </LegalParagraph>
        <LegalParagraph>
          <strong>Service providers.</strong> We engage trusted third-party
          vendors to operate the Service on our behalf, including cloud
          infrastructure providers (hosting and storage), payment processing
          (Paddle), and product analytics (Mixpanel). These vendors are
          contractually bound to process your data only as instructed and in
          accordance with applicable law.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Billing — Paddle.</strong> Subscription payments are handled
          by Paddle.com Market Limited (&quot;Paddle&quot;), who acts as a
          Merchant of Record for our products. When you purchase a subscription,
          your payment information is collected and processed by Paddle in
          accordance with the Paddle Privacy Policy. We receive confirmation of
          payment status and the details necessary to provision your account; we
          do not store full card details.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Within your organisation.</strong> Session recordings and the
          associated metadata are visible only to members of your Repro project.
          We do not share recording data across separate organisations.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Legal requirements.</strong> We may disclose your information
          if required to do so by law, regulation, or a valid legal process such
          as a court order, subpoena, or search warrant.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Business transfers.</strong> In the event of a merger,
          acquisition, or sale of all or a portion of our assets, your
          information may be transferred to the acquiring entity. We will notify
          you via email and/or a prominent notice on the Service before your
          information is transferred and becomes subject to a different privacy
          policy.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Data Retention">
        <LegalParagraph>
          We retain your account information for as long as your account is
          active or as needed to provide the Service. If you delete your
          account, we will delete or anonymise your personal data within 30
          days, except where we are required to retain it for legal, accounting,
          or fraud-prevention purposes.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Session recordings</strong> are retained according to your
          billing plan. Free-plan recordings are retained for 30 days. Paid
          plans offer extended retention periods as specified in your plan
          details. Recordings are permanently deleted when the retention window
          expires or when you manually delete them, whichever comes first.
        </LegalParagraph>
        <LegalParagraph>
          Aggregate and anonymised analytics data may be retained indefinitely
          and is not subject to deletion requests.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Your Rights">
        <LegalParagraph>
          Depending on where you are located, you may have the following rights
          with respect to your personal data:
        </LegalParagraph>
        <LegalParagraph>
          <strong>GDPR (EEA / UK residents).</strong> You have the right to
          access a copy of the personal data we hold about you; rectify
          inaccurate data; erase your data (&quot;right to be forgotten&quot;);
          restrict or object to certain processing; and receive your data in a
          portable, machine-readable format. Where processing is based on
          consent, you may withdraw consent at any time. You also have the right
          to lodge a complaint with your local supervisory authority.
        </LegalParagraph>
        <LegalParagraph>
          <strong>CCPA (California residents).</strong> You have the right to
          know what personal information we collect, use, and disclose; request
          deletion of your personal information; opt-out of the sale of your
          personal information (we do not sell personal information); and not be
          discriminated against for exercising your rights. To submit a &quot;Do
          Not Sell My Personal Information&quot; request or any other rights
          request, please contact us at the address below.
        </LegalParagraph>
        <LegalParagraph>
          To exercise any of these rights, please contact us at
          privacy@repro.dev. We will respond to verified requests within 30 days
          (or sooner where required by applicable law).
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Cookies">
        <LegalParagraph>
          We use cookies and similar tracking technologies to operate the
          Service. Strictly necessary cookies are required for authentication
          and security and cannot be disabled. Analytics and preference cookies
          (including those set by Mixpanel) are optional and are only set with
          your consent.
        </LegalParagraph>
        <LegalParagraph>
          You can control cookies through your browser settings. Disabling
          optional cookies may affect some features of the Service. We do not
          currently respond to browser Do Not Track signals, but we honour the
          consent choices you make through our cookie banner.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Security">
        <LegalParagraph>
          We take the security of your data seriously. Session recordings and
          all personal data are encrypted in transit (TLS 1.2 or higher) and at
          rest (AES-256). Access to recording data is restricted to members of
          your Repro project; our staff can access customer data only where
          necessary to provide support and are bound by confidentiality
          obligations.
        </LegalParagraph>
        <LegalParagraph>
          Despite these measures, no security system is impenetrable. We cannot
          guarantee that your information will never be accessed, disclosed,
          altered, or destroyed in a breach. If we become aware of a security
          breach that affects your data, we will notify you in accordance with
          applicable law.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="International Data Transfers">
        <LegalParagraph>
          Repro is based in the United Kingdom. If you are accessing the Service
          from outside the UK or EEA, please be aware that your information may
          be transferred to, stored, and processed in countries where data
          protection laws may differ from those of your home country. Where we
          transfer personal data from the EEA or UK to third countries, we rely
          on the European Commission&apos;s Standard Contractual Clauses or the
          UK International Data Transfer Agreement, as applicable, to provide an
          appropriate level of protection.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Children's Privacy">
        <LegalParagraph>
          The Service is not directed at children under the age of 13, and we do
          not knowingly collect personal information from children under 13. If
          you believe we have inadvertently collected personal information from
          a child under 13, please contact us immediately so that we can delete
          it.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Changes to This Policy">
        <LegalParagraph>
          We may update this Privacy Policy from time to time. When we do, we
          will update the &quot;Last updated&quot; date at the top of this page
          and, for material changes, notify you by email or by posting a notice
          on the Service. Your continued use of the Service after any changes
          constitutes your acceptance of the updated policy.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="Contact Us">
        <LegalParagraph>
          If you have any questions about this Privacy Policy or our data
          practices, or to exercise your data rights, please contact us:
        </LegalParagraph>
        <LegalParagraph>
          Email: privacy@repro.dev
          <br />
          Repro Ltd, United Kingdom
        </LegalParagraph>
        <LegalParagraph>
          If you are located in the EEA and are not satisfied with our response,
          you have the right to lodge a complaint with your local data
          protection supervisory authority.
        </LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  )
}
