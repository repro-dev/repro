export function formatSubscriptionStatus(status: string | null | undefined) {
  switch (status) {
    case 'canceled':
      return 'Cancelled'
    case null:
    case undefined:
      return 'No subscription'
    default:
      return status.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
  }
}
