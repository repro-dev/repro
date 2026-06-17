/* eslint-disable @repro/oxlint-plugin-design/no-classname-prop */
'use client'
/* eslint-disable react/forbid-elements */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import headerStyles from './Header.module.css'
import { MarketingLogo } from './MarketingLogo'
import { primaryNavLinks, signupHref } from './marketingShell'
import sharedStyles from './MarketingShell.module.css'

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const mobileToggleRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!mobileMenuOpen) {
      return
    }

    closeButtonRef.current?.focus()
  }, [mobileMenuOpen])

  const closeMobileMenu = (restoreFocus = true) => {
    setMobileMenuOpen(false)

    if (restoreFocus) {
      window.requestAnimationFrame(() => mobileToggleRef.current?.focus())
    }
  }

  const handleMobileMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMobileMenu()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const focusableElements = Array.from(
      mobileMenuRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])'
      ) ?? []
    )
    const firstFocusable = focusableElements[0]
    const lastFocusable = focusableElements[focusableElements.length - 1]

    if (!firstFocusable || !lastFocusable) {
      return
    }

    if (event.shiftKey && document.activeElement === firstFocusable) {
      event.preventDefault()
      lastFocusable.focus()
      return
    }

    if (!event.shiftKey && document.activeElement === lastFocusable) {
      event.preventDefault()
      firstFocusable.focus()
    }
  }

  return (
    <header className={headerStyles.siteHeader}>
      <div className={headerStyles.siteHeaderRow}>
        <a href="/" aria-label="Repro home" className={headerStyles.logoLink}>
          <MarketingLogo className={headerStyles.logo} />
        </a>

        <nav className={headerStyles.desktopNav} aria-label="Primary">
          {primaryNavLinks.map(({ href, label }) => (
            <a key={href} className={headerStyles.headerLink} href={href}>
              {label}
            </a>
          ))}
        </nav>

        <div className={headerStyles.headerActions}>
          <a
            className={cx(
              sharedStyles.button,
              sharedStyles.primaryCta,
              headerStyles.headerCta
            )}
            href={signupHref}
          >
            Get started for free
          </a>

          <button
            ref={mobileToggleRef}
            type="button"
            className={cx(sharedStyles.button, headerStyles.mobileToggle)}
            aria-expanded={mobileMenuOpen}
            aria-controls="marketing-mobile-menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span aria-hidden="true">☰</span>
            Menu
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div
          ref={mobileMenuRef}
          id="marketing-mobile-menu"
          className={headerStyles.mobileMenu}
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          onClick={() => closeMobileMenu()}
          onKeyDown={handleMobileMenuKeyDown}
        >
          <div
            className={headerStyles.mobileMenuPanel}
            onClick={event => event.stopPropagation()}
          >
            <div className={headerStyles.mobileMenuHeader}>
              <button
                ref={closeButtonRef}
                type="button"
                className={headerStyles.mobileMenuClose}
                aria-label="Close site navigation"
                onClick={() => closeMobileMenu()}
              >
                ×
              </button>
            </div>

            <nav className={headerStyles.mobileNav} aria-label="Primary">
              {primaryNavLinks.map(({ href, label }) => (
                <a
                  key={href}
                  className={headerStyles.headerLink}
                  href={href}
                  onClick={() => closeMobileMenu(false)}
                >
                  {label}
                </a>
              ))}
            </nav>

            <a
              href={signupHref}
              className={cx(
                sharedStyles.button,
                sharedStyles.primaryCta,
                headerStyles.headerCta,
                headerStyles.mobileMenuCta
              )}
              onClick={() => closeMobileMenu(false)}
            >
              Get started for free
            </a>
          </div>
        </div>
      ) : null}
    </header>
  )
}
/* eslint-enable */
