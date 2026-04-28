import { footerGroups, socialLinks } from './marketingShell'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="marketing-shell__site-footer">
      <div className="marketing-shell__site-footer-inner">
        <div className="marketing-shell__grid-4">
          {footerGroups.map(group => (
            <section
              key={group.title}
              className="marketing-shell__site-footer-group"
              aria-labelledby={`footer-${group.title.toLowerCase()}`}
            >
              <h2
                id={`footer-${group.title.toLowerCase()}`}
                className="marketing-shell__footer-title"
              >
                {group.title}
              </h2>

              <nav
                aria-label={group.title}
                className="marketing-shell__site-footer-nav"
              >
                {group.links.map(link => (
                  <a
                    key={link.href}
                    className="marketing-shell__footer-link"
                    href={link.href}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </section>
          ))}
        </div>

        <div className="marketing-shell__site-footer-meta">
          <p>© {year} Repro</p>

          <nav
            aria-label="Social links"
            className="marketing-shell__site-footer-social"
          >
            {socialLinks.map(link => (
              <a
                key={link.href}
                className="marketing-shell__footer-social-link"
                href={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}
