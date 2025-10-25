import { logger } from '@repro/logger'
import React, { MutableRefObject, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import mergeRefs from 'react-merge-refs'

type Props = React.HTMLProps<HTMLIFrameElement>

// Bypass trusted-types CSP when writing doctype
let passthroughHTMLPolicy: Pick<TrustedTypePolicy, 'name' | 'createHTML'> | null

try {
  passthroughHTMLPolicy =
    window.trustedTypes && window.trustedTypes.createPolicy
      ? window.trustedTypes.createPolicy('passthrough-html', {
          createHTML: (html: string) => html,
        })
      : null
} catch (err) {
  logger.error(err)
  passthroughHTMLPolicy = null
}

function createTrustedHTMLIfSupported(html: string) {
  return passthroughHTMLPolicy ? passthroughHTMLPolicy.createHTML(html) : html
}

function attemptWriteToDocument(doc: Document, html: string) {
  try {
    // The type for Document.write sink in lib.dom does not currently
    // support passing TrustedHTML object. Cast as string to keep
    // the type-checker happy.
    doc.write(createTrustedHTMLIfSupported(html) as string)
  } catch {}
}

export const FrameRealm = React.forwardRef<HTMLIFrameElement, Props>(
  ({ children, ...props }, outerRef) => {
    const innerRef = useRef() as MutableRefObject<HTMLIFrameElement>
    const ref = mergeRefs([innerRef, outerRef])
    const [root, setRoot] = useState<Document | null>(null)

    useEffect(() => {
      if (innerRef && innerRef.current) {
        const frame = innerRef.current
        const doc = frame.contentDocument

        if (doc) {
          doc.open()
          attemptWriteToDocument(doc, '<!doctype html>')
          doc.close()

          const root = document.createElement('html')
          doc.documentElement.remove()
          doc.appendChild(root)

          setRoot(doc)
        }
      }
    }, [innerRef, setRoot])

    // TODO merge <html> attributes into root

    return (
      <iframe
        ref={ref}
        {...props}
        style={{
          border: '0',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          ...props.style,
        }}
      >
        {root && createPortal(children, root.documentElement)}
      </iframe>
    )
  }
)
