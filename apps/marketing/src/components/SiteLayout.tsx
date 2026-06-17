/* eslint-disable @repro/oxlint-plugin-design/no-classname-prop */
/* eslint-disable react/forbid-elements */
import type { ReactNode } from 'react'
import { Footer } from './Footer'
import { Header } from './Header'
import layoutStyles from './SiteLayout.module.css'

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

interface SiteLayoutProps {
  children: ReactNode
}

export function SiteLayout({ children }: SiteLayoutProps) {
  return (
    <div className={layoutStyles.pageShell}>
      <a href="#main-content" className={layoutStyles.skipLink}>
        Skip to main content
      </a>

      <Header />

      <main id="main-content" className={cx(layoutStyles.pageMain)}>
        {children}
      </main>

      <Footer />
    </div>
  )
}
/* eslint-enable */
