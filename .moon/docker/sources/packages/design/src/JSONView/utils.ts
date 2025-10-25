export function isCollapsible(data: any) {
  if (data === null) {
    return false
  }

  return Array.isArray(data) || typeof data === 'object'
}
