export function dispatchLifecycleEvent(
  target: Element,
  type: 'animationend' | 'transitionend'
) {
  const EventCtor = target.ownerDocument.defaultView?.Event ?? Event

  target.dispatchEvent(
    new EventCtor(type, {
      bubbles: true,
      cancelable: true,
    })
  )
}

export function dispatchAnimationEnd(target: Element) {
  dispatchLifecycleEvent(target, 'animationend')
}

export function dispatchTransitionEnd(target: Element) {
  dispatchLifecycleEvent(target, 'transitionend')
}
