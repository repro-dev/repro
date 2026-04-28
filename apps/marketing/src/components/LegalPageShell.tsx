import React from 'react'

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
    <section aria-labelledby={titleId} className="marketing-shell__legal-shell">
      <div className="marketing-shell__legal-inner">
        <div className="marketing-shell__legal-card">
          <header className="marketing-shell__legal-header">
            <h1 id={titleId} className="marketing-shell__legal-title">
              {title}
            </h1>
            <p className="marketing-shell__legal-updated">
              Last updated: {lastUpdated}
            </p>
          </header>

          <div className="marketing-shell__legal-content">{children}</div>
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
    <section className="marketing-shell__legal-section">
      <h2 className="marketing-shell__legal-heading">{heading}</h2>
      <div className="marketing-shell__legal-section-body">{children}</div>
    </section>
  )
}

interface LegalParagraphProps {
  children: React.ReactNode
}

export function LegalParagraph({ children }: LegalParagraphProps) {
  return <p className="marketing-shell__legal-copy">{children}</p>
}
