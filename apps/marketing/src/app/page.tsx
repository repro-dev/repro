import type { Metadata } from 'next'
import { HeroSection } from '~/components/HeroSection'

export const metadata: Metadata = {
  title: 'Bug reporting that captures every detail',
}

export default function HomePage() {
  return <HeroSection />
}
