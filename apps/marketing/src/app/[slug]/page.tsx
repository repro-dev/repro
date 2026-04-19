import { notFound } from 'next/navigation'
import { MarketingPlaceholderPage } from '~/components/MarketingPlaceholderPage'
import {
  isMarketingRouteSlug,
  placeholderPageContent,
} from '~/components/marketingShell'

export function generateStaticParams() {
  return Object.keys(placeholderPageContent).map(slug => ({ slug }))
}

export default async function MarketingRoutePage({ params }: any) {
  const { slug } = await params

  if (!isMarketingRouteSlug(slug)) {
    notFound()
  }

  return <MarketingPlaceholderPage slug={slug} />
}
