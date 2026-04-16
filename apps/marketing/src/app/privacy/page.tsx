import type { Metadata } from 'next'
import { PrivacyPolicy } from '~/components/PrivacyPolicy'

export const metadata: Metadata = {
  title: 'Privacy Policy | Repro',
  description:
    'Learn how Repro collects, uses, and protects your data, including session recordings, account information, and billing data.',
}

export default function PrivacyPage() {
  return <PrivacyPolicy />
}
