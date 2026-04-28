'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MarketingLogo } from './MarketingLogo'
import { primaryNavLinks, signupHref } from './marketingShell'

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
    <header className="marketing-shell__site-header">
      <div className="marketing-shell__site-header-row">
        <a
          href="/"
          aria-label="Repro home"
          className="marketing-shell__logo-link"
        >
          <MarketingLogo className="marketing-shell__logo" />
        </a>

        <nav className="marketing-shell__desktop-nav" aria-label="Primary">
          {primaryNavLinks.map(({ href, label }) => (
            <a key={href} className="marketing-shell__header-link" href={href}>
              {label}
            </a>
          ))}
        </nav>

        <div className="marketing-shell__header-actions">
          <a
            className="marketing-shell__button marketing-shell__header-cta"
            href={signupHref}
          >
            Start free
          </a>

          <button
            ref={mobileToggleRef}
            type="button"
            className="marketing-shell__button marketing-shell__mobile-toggle"
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
          className="marketing-shell__mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-labelledby="marketing-menu-title"
          onClick={() => closeMobileMenu()}
          onKeyDown={handleMobileMenuKeyDown}
        >
          <div
            className="marketing-shell__mobile-menu-panel"
            onClick={event => event.stopPropagation()}
          >
            <div className="marketing-shell__mobile-menu-header">
              <h2
                id="marketing-menu-title"
                className="marketing-shell__mobile-menu-title"
              >
                Site navigation
              </h2>

              <button
                ref={closeButtonRef}
                type="button"
                className="marketing-shell__mobile-menu-close"
                aria-label="Close site navigation"
                onClick={() => closeMobileMenu()}
              >
                ×
              </button>
            </div>

            <nav className="marketing-shell__mobile-nav" aria-label="Primary">
              {primaryNavLinks.map(({ href, label }) => (
                <a
                  key={href}
                  className="marketing-shell__header-link"
                  href={href}
                  onClick={() => closeMobileMenu(false)}
                >
                  {label}
                </a>
              ))}
            </nav>

            <a
              href={signupHref}
              className="marketing-shell__button marketing-shell__header-cta marketing-shell__mobile-menu-cta"
              onClick={() => closeMobileMenu(false)}
            >
              Start free
            </a>
          </div>
        </div>
      ) : null}
    </header>
  )
}
