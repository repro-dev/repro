import type { Metadata } from 'next'
import { HeroSection } from '~/components/HeroSection'
import { JsonLd } from '~/components/JsonLd'
import { defaultEnv } from '~/config/env'
import {
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebSiteJsonLd,
} from '~/lib/jsonld'
import { buildPageMetadata } from '~/lib/metadata'

export const metadata: Metadata = buildPageMetadata({
  title: 'Bug reporting that captures every detail',
  description:
    'Repro automatically captures sessions so your team can reproduce and fix bugs faster — without the back-and-forth.',
})

export default function HomePage() {
  return (
    <>
      <JsonLd data={buildOrganizationJsonLd()} />
      <JsonLd data={buildSoftwareApplicationJsonLd()} />
      <JsonLd data={buildWebSiteJsonLd(defaultEnv.REPRO_MARKETING_URL)} />
      <HeroSection />
    </>
  )
}
