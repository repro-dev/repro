import React from 'react'
import legalStyles from './LegalPageShell.module.css'
import sharedStyles from './MarketingShell.module.css'
/* eslint-disable @repro/oxlint-plugin-design/no-classname-prop */

interface LegalPageShellProps {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

export default function LegalPageShell({
  title,
  lastUpdated,
  children,
}: LegalPageShellProps) {
  const titleId = React.useId()

  return (
    <section aria-labelledby={titleId} className={legalStyles.legalShell}>
      {/* eslint-disable-next-line react/forbid-elements */}
      <div className={legalStyles.legalInner}>
        {/* eslint-disable-next-line react/forbid-elements */}
        <div className={legalStyles.legalCard}>
          <header className={legalStyles.legalHeader}>
            <h1 id={titleId} className={sharedStyles.legalTitle}>
              {title}
            </h1>
            <p className={legalStyles.legalUpdated}>
              Last updated: {lastUpdated}
            </p>
          </header>

          {/* eslint-disable-next-line react/forbid-elements */}
          <div className={legalStyles.legalContent}>{children}</div>
        </div>
      </div>
    </section>
  )
}

interface LegalSectionProps {
  heading: string
  children: React.ReactNode
}

export function LegalSection({ heading, children }: LegalSectionProps) {
  return (
    <section className={legalStyles.legalSection}>
      <h2 className={legalStyles.legalHeading}>{heading}</h2>
      {/* eslint-disable-next-line react/forbid-elements */}
      <div className={legalStyles.legalSectionBody}>{children}</div>
    </section>
  )
}

interface LegalParagraphProps {
  children: React.ReactNode
}

export function LegalParagraph({ children }: LegalParagraphProps) {
  return <p className={sharedStyles.legalCopy}>{children}</p>
}
/* eslint-enable */
