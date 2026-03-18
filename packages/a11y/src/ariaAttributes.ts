export function addAriaAttribute(
  element: Element,
  attribute: string,
  id: string
): void {
  const current = element.getAttribute(attribute)
  const ids = current ? current.split(/\s+/).filter(Boolean) : []

  if (ids.includes(id)) {
    return
  }

  ids.push(id)
  element.setAttribute(attribute, ids.join(' '))
}

export function removeAriaAttribute(
  element: Element,
  attribute: string,
  id: string
): void {
  const current = element.getAttribute(attribute)

  if (!current) {
    return
  }

  const ids = current
    .split(/\s+/)
    .filter(Boolean)
    .filter(existing => existing !== id)

  if (ids.length === 0) {
    element.removeAttribute(attribute)
  } else {
    element.setAttribute(attribute, ids.join(' '))
  }
}
