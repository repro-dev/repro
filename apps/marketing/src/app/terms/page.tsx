import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import React from 'react'
import LegalPageShell, {
  LegalParagraph,
  LegalSection,
} from '~/components/LegalPageShell'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Read the Terms of Service for Repro — the bug reporting platform that automatically captures sessions so your team can reproduce and fix bugs faster.',
}

function LegalSummary({ children }: { children: ReactNode }) {
  return (
    <LegalParagraph>
      <strong>Plain-language summary:</strong> {children}
    </LegalParagraph>
  )
}

export default function TermsPage() {
  return (
    <React.Fragment>
      <LegalPageShell title="Terms of Service" lastUpdated="April 15, 2026">
        <LegalSection heading="1. Introduction and Acceptance of Terms">
          <LegalSummary>
            You can use Repro only if you agree to these rules, and
            organisations are responsible for the people who use the Service on
            their behalf.
          </LegalSummary>
          <LegalParagraph>
            Welcome to Repro ("we", "us", or "our"). By accessing or using our
            bug-reporting and session-recording platform at repro.dev (the
            "Service"), you agree to be bound by these Terms of Service
            ("Terms"). Please read them carefully before using the Service.
          </LegalParagraph>
          <LegalParagraph>
            If you are using the Service on behalf of an organisation, you
            represent that you have the authority to bind that organisation to
            these Terms. In that case, "you" and "your" refer to that
            organisation.
          </LegalParagraph>
          <LegalParagraph>
            If you do not agree to these Terms, please do not use the Service.
            Your continued use of the Service following any changes to these
            Terms constitutes acceptance of those changes.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="2. Use of Service">
          <LegalSummary>
            You may use Repro for internal business purposes, but not to break
            the Service, other people's systems, or applicable law.
          </LegalSummary>
          <LegalParagraph>
            Subject to your compliance with these Terms, we grant you a limited,
            non-exclusive, non-transferable, revocable licence to access and use
            the Service for your internal business purposes.
          </LegalParagraph>
          <LegalParagraph>
            You agree not to: (a) reverse-engineer, decompile, disassemble, or
            otherwise attempt to derive the source code of the Service; (b) use
            the Service to store or transmit malicious code; (c) interfere with
            or disrupt the integrity or performance of the Service or
            third-party data contained therein; (d) attempt to gain unauthorised
            access to the Service or its related systems; (e) use the Service in
            any manner that violates applicable law or regulation.
          </LegalParagraph>
          <LegalParagraph>
            Repro's browser extension captures page interactions, console logs,
            network requests, and DOM state solely for the purpose of bug
            reporting and reproduction within your authorised workspace. You are
            responsible for ensuring that users whose sessions may be recorded
            have been informed of and, where required by applicable law, have
            consented to such recording.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="3. User Accounts">
          <LegalSummary>
            You are responsible for your account and should tell us right away
            if someone else gets access to it.
          </LegalSummary>
          <LegalParagraph>
            To access the Service, you must create an account. You agree to
            provide accurate, current, and complete information during
            registration and to update that information to keep it accurate,
            current, and complete.
          </LegalParagraph>
          <LegalParagraph>
            You are responsible for safeguarding your account credentials and
            for all activities that occur under your account. You agree to
            notify us immediately at support@repro.dev if you suspect any
            unauthorised use of your account. We are not liable for any loss or
            damage arising from your failure to maintain the security of your
            account.
          </LegalParagraph>
          <LegalParagraph>
            You may not share your account credentials with others or allow
            others to access the Service through your account, except for
            authorised team members within your workspace.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="4. Intellectual Property">
          <LegalSummary>
            You own your content and recordings, and we only use them to operate
            the Service for you.
          </LegalSummary>
          <LegalParagraph>
            The Service and its original content, features, and functionality
            are and will remain the exclusive property of Repro and its
            licensors. Our trademarks and trade dress may not be used in
            connection with any product or service without our prior written
            consent.
          </LegalParagraph>
          <LegalParagraph>
            You retain ownership of all content and data you submit to the
            Service ("User Content"). By submitting User Content, you grant us a
            worldwide, royalty-free, non-exclusive licence to host, store,
            process, and transmit that content solely to the extent necessary to
            provide the Service to you.
          </LegalParagraph>
          <LegalParagraph>
            Session recordings, bug reports, and associated metadata you capture
            through the Service remain your property. We do not claim any
            ownership interest in your recordings and will not use them for any
            purpose other than providing the Service, unless otherwise required
            by law.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="5. Data and Privacy">
          <LegalSummary>
            We process recordings to provide the Service, your workspace
            controls retention, and our Privacy Policy and Refund Policy explain
            the rest.
          </LegalSummary>
          <LegalParagraph>
            Your use of the Service is also governed by our{' '}
            <Link href="/privacy">Privacy Policy</Link> and our{' '}
            <Link href="/refund-policy">Refund Policy</Link>, which are
            incorporated into these Terms by reference. By using the Service,
            you consent to the collection and use of information as described in
            the Privacy Policy.
          </LegalParagraph>
          <LegalParagraph>
            We take reasonable technical and organisational measures to protect
            your data against unauthorised access, loss, or disclosure. Session
            recordings are stored encrypted at rest and in transit.
          </LegalParagraph>
          <LegalParagraph>
            You control your data retention settings within your workspace.
            Unless a longer period is required by law or agreed in writing,
            session recordings and associated data are retained in accordance
            with your configured retention policy or, by default, for a period
            of 90 days from capture.
          </LegalParagraph>
          <LegalParagraph>
            If you process personal data of individuals in the European Economic
            Area, United Kingdom, or other jurisdictions that require a data
            processing agreement, please contact us at privacy@repro.dev to
            arrange appropriate data processing terms.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="6. Disclaimers">
          <LegalSummary>
            The Service is provided without warranties, and third-party tools
            are handled by their own providers.
          </LegalSummary>
          <LegalParagraph>
            THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS
            WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING
            BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </LegalParagraph>
          <LegalParagraph>
            We do not warrant that the Service will be uninterrupted,
            error-free, or completely secure. We do not warrant that the results
            obtained from using the Service will be accurate or reliable.
          </LegalParagraph>
          <LegalParagraph>
            Third-party integrations available through the Service are provided
            for convenience only. We are not responsible for the content,
            functionality, or data practices of third-party services.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="7. Limitation of Liability">
          <LegalSummary>
            If something goes wrong, our liability is limited by law and by the
            amounts you have paid.
          </LegalSummary>
          <LegalParagraph>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL
            REPRO, ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR
            LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO
            LOSS OF PROFITS, LOSS OF DATA, LOSS OF GOODWILL, SERVICE
            INTERRUPTION, COMPUTER DAMAGE, OR SYSTEM FAILURE, ARISING OUT OF OR
            IN CONNECTION WITH THESE TERMS OR YOUR USE OF THE SERVICE, EVEN IF
            REPRO HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </LegalParagraph>
          <LegalParagraph>
            IN NO EVENT WILL REPRO'S TOTAL AGGREGATE LIABILITY TO YOU FOR ALL
            CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE
            EXCEED THE GREATER OF (A) THE AMOUNTS PAID BY YOU TO REPRO IN THE
            TWELVE MONTHS PRECEDING THE CLAIM OR (B) ONE HUNDRED UNITED STATES
            DOLLARS (US$100).
          </LegalParagraph>
          <LegalParagraph>
            Some jurisdictions do not allow the exclusion or limitation of
            liability for certain types of damages, so some of the above
            limitations may not apply to you.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="8. Termination">
          <LegalSummary>
            Either side can end the relationship, and we keep data briefly so
            you can export it.
          </LegalSummary>
          <LegalParagraph>
            You may terminate your account at any time by contacting us at
            support@repro.dev or through your workspace settings. Upon
            termination, your right to use the Service will immediately cease.
          </LegalParagraph>
          <LegalParagraph>
            We may suspend or terminate your access to the Service at any time,
            with or without notice, if we have reason to believe that you have
            violated these Terms or if we discontinue the Service. We will
            endeavour to provide reasonable advance notice of planned
            discontinuation where practicable.
          </LegalParagraph>
          <LegalParagraph>
            Upon termination, we will retain your data for a period of 30 days
            to allow you to export it, after which it will be deleted in
            accordance with our data deletion policy. Provisions of these Terms
            that by their nature should survive termination shall survive,
            including intellectual property provisions, disclaimers, and
            limitations of liability.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="9. Changes to Terms">
          <LegalSummary>
            We can update these Terms, but we will give notice before material
            changes take effect.
          </LegalSummary>
          <LegalParagraph>
            We reserve the right to modify these Terms at any time. We will
            notify you of material changes by sending an email to the address
            associated with your account or by posting a notice in the Service
            at least 14 days before the changes take effect.
          </LegalParagraph>
          <LegalParagraph>
            If you continue to use the Service after the effective date of the
            revised Terms, you are agreeing to be bound by the revised Terms. If
            you do not agree to the revised Terms, you must stop using the
            Service before the effective date.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="10. Governing Law">
          <LegalSummary>
            English law applies, and courts in England and Wales handle
            disputes.
          </LegalSummary>
          <LegalParagraph>
            These Terms shall be governed by and construed in accordance with
            the laws of England and Wales, without regard to its conflict of law
            provisions. You agree to submit to the personal jurisdiction of the
            courts located in England and Wales for the resolution of any
            disputes arising out of or relating to these Terms or the Service.
          </LegalParagraph>
          <LegalParagraph>
            Notwithstanding the foregoing, we may seek injunctive or other
            equitable relief in any court of competent jurisdiction to protect
            our intellectual property rights.
          </LegalParagraph>
        </LegalSection>

        <LegalSection heading="11. Contact Information">
          <LegalSummary>
            If you have questions, use the legal, support, or privacy contacts
            below.
          </LegalSummary>
          <LegalParagraph>
            If you have any questions about these Terms of Service, please
            contact us:
          </LegalParagraph>
          <LegalParagraph>
            Repro
            <br />
            Email: legal@repro.dev
            <br />
            Support: support@repro.dev
            <br />
            Privacy: privacy@repro.dev
          </LegalParagraph>
        </LegalSection>
      </LegalPageShell>
    </React.Fragment>
  )
}
