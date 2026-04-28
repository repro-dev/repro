import type { ReactNode } from 'react'
import { Footer } from './Footer'
import { Header } from './Header'

interface SiteLayoutProps {
  children: ReactNode
}

export function SiteLayout({ children }: SiteLayoutProps) {
  return (
    <div className="marketing-shell__page-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Header />

      <main id="main-content" className="marketing-shell__page-main">
        {children}
      </main>

      <Footer />
    </div>
  )
}
