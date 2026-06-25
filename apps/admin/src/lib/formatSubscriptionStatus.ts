export function formatSubscriptionStatus(status: string | null | undefined) {
  switch (status) {
    case 'canceled':
      return 'cancelled'
    case null:
    case undefined:
      return 'No subscription'
    default:
      return status.replaceAll('_', ' ')
  }
}
