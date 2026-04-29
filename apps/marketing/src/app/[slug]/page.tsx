import { notFound } from 'next/navigation'
import { MarketingRoutePage as MarketingRoutePageContent } from '~/components/MarketingRoutePage'
import {
  isMarketingRouteSlug,
  routePageContent,
} from '~/components/marketingShell'

export function generateStaticParams() {
  return Object.keys(routePageContent).map(slug => ({ slug }))
}

export default async function MarketingRoutePage({ params }: any) {
  const { slug } = await params

  if (!isMarketingRouteSlug(slug)) {
    notFound()
  }

  return <MarketingRoutePageContent slug={slug} />
}
