import {
  routePageContent,
  signupHref,
  type MarketingRouteSlug,
} from './marketingShell'

interface MarketingRoutePageProps {
  slug: MarketingRouteSlug
}

export function MarketingRoutePage({ slug }: MarketingRoutePageProps) {
  const page = routePageContent[slug]

  return (
    <section className="marketing-shell__route-page">
      <p className="marketing-shell__route-kicker">Capture / replay / fix</p>

      <h1 className="marketing-shell__route-title">{page.title}</h1>

      <p className="marketing-shell__route-copy">{page.body}</p>

      <div className="marketing-shell__route-actions">
        <a className="marketing-shell__primary-cta" href={signupHref}>
          Start free
        </a>

        <a className="marketing-shell__secondary-cta" href="/">
          Back home
        </a>
      </div>
    </section>
  )
}
