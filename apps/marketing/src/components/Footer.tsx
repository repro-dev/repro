import footerStyles from './Footer.module.css'
import { footerGroups } from './marketingShell'
import sharedStyles from './MarketingShell.module.css'

const cx = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className={footerStyles.siteFooter}>
      <div className={footerStyles.siteFooterInner}>
        <div className={cx(sharedStyles.grid4, footerStyles.siteFooterGrid)}>
          {footerGroups.map(group => (
            <section
              key={group.title}
              className={footerStyles.siteFooterGroup}
              aria-labelledby={`footer-${group.title.toLowerCase()}`}
            >
              <h2
                id={`footer-${group.title.toLowerCase()}`}
                className={cx(
                  sharedStyles.footerTitle,
                  footerStyles.footerTitle
                )}
              >
                {group.title}
              </h2>

              <nav
                aria-label={group.title}
                className={footerStyles.siteFooterNav}
              >
                {group.links.map(link => (
                  <a
                    key={link.href}
                    className={cx(
                      sharedStyles.footerLink,
                      footerStyles.footerLink
                    )}
                    href={link.href}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </section>
          ))}
        </div>

        <div className={footerStyles.siteFooterMeta}>
          <p>© {year} Repro Software Ltd</p>
        </div>
      </div>
    </footer>
  )
}
