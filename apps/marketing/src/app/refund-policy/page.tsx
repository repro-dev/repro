import type { Metadata } from 'next'
import RefundPolicyContent from './RefundPolicyContent'

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy',
}

export default function RefundPolicyPage() {
  return <RefundPolicyContent />
}
