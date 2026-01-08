import Future, { FutureInstance } from 'fluture'

export function createIframe(
  src: string,
  style: Partial<CSSStyleDeclaration> = {}
): FutureInstance<Error, HTMLIFrameElement> {
  return Future((reject, resolve) => {
    const iframe = document.createElement('iframe')
    iframe.classList.add('repro-ignore')
    iframe.src = src

    Object.assign(iframe.style, style)

    iframe.onload = () => {
      resolve(iframe)
    }

    iframe.onerror = () => {
      reject(new Error('Could not create IFrame element'))
    }

    document.body.appendChild(iframe)

    return () => {
      iframe.remove()
    }
  })
}
