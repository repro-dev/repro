/**
 * @repro/dom-to-image
 *
 * Vendored fork of dom-to-image-more v3.7.2.
 * Chrome / same-origin only — Safari, Firefox, and cross-origin paths stripped.
 *
 * Upstream fixes applied:
 *   #218 — makeImage() removeChild crash from iframe context
 *   #215 — <svg><use xlink:href="#symbol"> not rendered
 *   #191 — background-image url() quote escaping producing blank boxes
 *
 * Call-site note (#201): If capturing an iframe's documentElement, wrap it in a
 * <div> before passing here to avoid an uncaught SVG event in Chrome.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Options {
  width?: number
  height?: number
  bgcolor?: string
  style?: Partial<CSSStyleDeclaration>
  filter?: (node: Node) => boolean
  onclone?: (clone: Element) => void | Promise<void>
  scale?: number
  disableEmbedFonts?: boolean
  disableInlineImages?: boolean
  copyDefaultStyles?: boolean
  styleCaching?: 'strict' | 'relaxed'
  adjustClonedNode?: (original: Node, clone: Node, isAfter: boolean) => void
  filterStyles?: (element: Element, propertyName: string) => boolean
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const ELEMENT_NODE = Node.ELEMENT_NODE

// URL cache — cleared after each toPng call
let urlCache: Array<{ url: string; promise: Promise<string> }> = []

// Sandbox iframe used for default-style computation
let sandbox: HTMLIFrameElement | null = null
let removeDefaultStylesTimeoutId: ReturnType<typeof setTimeout> | null = null
// tagKey → default styles object
let tagNameDefaultStyles: Record<string, Record<string, string>> = {}

// ---------------------------------------------------------------------------
// Internal impl options (populated by copyOptions before each run)
// ---------------------------------------------------------------------------

let implOptions = {
  copyDefaultStyles: true,
  imagePlaceholder: undefined as string | undefined,
  cacheBust: false,
  httpTimeout: 30000,
  styleCaching: 'strict' as 'strict' | 'relaxed',
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renders a DOM element to a PNG data URL.
 *
 * NOTE (issue #201): If capturing an iframe's documentElement, wrap it in a
 * <div> before passing here to avoid an uncaught SVG event in Chrome.
 *
 * @param node - The element to capture. Must be attached to a live document.
 * @param options - Optional rendering options.
 * @returns Promise resolving to a `data:image/png;base64,...` string.
 */
export function toPng(node: Element, options?: Options): Promise<string> {
  return draw(node, options ?? {}).then(canvas => canvas.toDataURL())
}

// ---------------------------------------------------------------------------
// Internal helpers — draw / toSvg
// ---------------------------------------------------------------------------

function draw(domNode: Element, options: Options): Promise<HTMLCanvasElement> {
  copyOptions(options)
  return toSvg(domNode, options)
    .then(svgDataUri => makeImage(svgDataUri))
    .then(image => {
      const scale = typeof options.scale === 'number' ? options.scale : 1
      const canvas = newCanvas(domNode, options, scale)
      const ctx = canvas.getContext('2d')!
      // Disable image smoothing for pixel-accurate output
      ctx.imageSmoothingEnabled = false
      if (image) {
        ctx.scale(scale, scale)
        ctx.drawImage(image, 0, 0)
      }
      return canvas
    })
}

function newCanvas(
  node: Element,
  options: Options,
  scale: number
): HTMLCanvasElement {
  let w = options.width ?? width(node)
  let h = options.height ?? height(node)

  if (isDimensionMissing(w)) {
    w = isDimensionMissing(h) ? 300 : h * 2.0
  }
  if (isDimensionMissing(h)) {
    h = w / 2.0
  }

  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale

  if (options.bgcolor) {
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = options.bgcolor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  return canvas
}

function toSvg(node: Element, options: Options): Promise<string> {
  const ownerWindow = getWindow(node)
  const restorations: Array<{ child: Node; wrapper: HTMLSpanElement }> = []

  return Promise.resolve(node)
    .then(ensureElement)
    .then(clone => cloneNode(clone, options, null, ownerWindow))
    .then(clone => (options.disableEmbedFonts ? Promise.resolve(clone) : embedFonts(clone)))
    .then(clone =>
      options.disableInlineImages ? Promise.resolve(clone) : inlineImages(clone)
    )
    .then(applyOptions)
    .then(makeSvgDataUri)
    .then(restoreWrappers)
    .then(clearCache)

  function ensureElement(n: Element): Element {
    if (n.nodeType === ELEMENT_NODE) return n

    const originalChild = n
    const wrappingSpan = document.createElement('span')
    originalChild.replaceWith(wrappingSpan)
    wrappingSpan.append(n)
    restorations.push({ child: originalChild, wrapper: wrappingSpan })
    return wrappingSpan
  }

  function restoreWrappers(result: string): string {
    while (restorations.length > 0) {
      const restoration = restorations.pop()!
      restoration.wrapper.replaceWith(restoration.child)
    }
    return result
  }

  function clearCache(result: string): string {
    urlCache = []
    removeSandbox()
    return result
  }

  function applyOptions(clone: Element): Promise<Element> {
    if (options.bgcolor) {
      ;(clone as HTMLElement).style.backgroundColor = options.bgcolor
    }
    if (options.width) {
      ;(clone as HTMLElement).style.width = `${options.width}px`
    }
    if (options.height) {
      ;(clone as HTMLElement).style.height = `${options.height}px`
    }
    if (options.style) {
      const style = options.style
      ;(Object.keys(style) as Array<keyof CSSStyleDeclaration>).forEach(
        property => {
          const value = style[property]
          if (typeof value === 'string') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(clone as HTMLElement).style[property as any] = value
          }
        }
      )
    }

    const onCloneResult: void | Promise<void> =
      typeof options.onclone === 'function' ? options.onclone(clone) : undefined

    return Promise.resolve(onCloneResult).then(() => clone)
  }

  function makeSvgDataUri(clone: Element): Promise<string> {
    const w = options.width ?? width(node)
    const h = options.height ?? height(node)

    return Promise.resolve(clone)
      .then(svg => {
        svg.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
        return new XMLSerializer().serializeToString(svg)
      })
      .then(escapeXhtml)
      .then(xhtml => {
        const foreignObjectSizing =
          (isDimensionMissing(w) ? ' width="100%"' : ` width="${w}"`) +
          (isDimensionMissing(h) ? ' height="100%"' : ` height="${h}"`)
        const svgSizing =
          (isDimensionMissing(w) ? '' : ` width="${w}"`) +
          (isDimensionMissing(h) ? '' : ` height="${h}"`)
        return `<svg xmlns="http://www.w3.org/2000/svg"${svgSizing}><foreignObject${foreignObjectSizing}>${xhtml}</foreignObject></svg>`
      })
      .then(svg => `data:image/svg+xml;charset=utf-8,${svg}`)
  }
}

// ---------------------------------------------------------------------------
// makeImage — Fix #218: guard removeChild to avoid NotFoundError in iframe ctx
// ---------------------------------------------------------------------------

function makeImage(uri: string): Promise<HTMLImageElement | undefined> {
  if (uri === 'data:,') {
    return Promise.resolve(undefined)
  }

  return new Promise((resolve, reject) => {
    // Wrap the image in an SVG element so it renders correctly
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const image = new Image()

    image.onload = function () {
      // Fix #218: guard removeChild — svg may already have been removed
      // if this callback fires after the document has been cleaned up.
      if (svg.parentNode === document.body) {
        document.body.removeChild(svg)
      }
      // Chrome doesn't need the rAF workaround; resolve immediately.
      resolve(image)
    }

    image.onerror = error => {
      // Fix #218: same guard in the error path
      if (svg.parentNode === document.body) {
        document.body.removeChild(svg)
      }
      reject(error)
    }

    svg.appendChild(image)
    image.src = uri
    document.body.appendChild(svg)
  })
}

// ---------------------------------------------------------------------------
// cloneNode
// ---------------------------------------------------------------------------

function cloneNode(
  node: Node,
  options: Options,
  parentComputedStyles: CSSStyleDeclaration | null,
  ownerWindow: Window & typeof globalThis
): Promise<Element> {
  const filter = options.filter

  // Skip sandbox iframe and script/style/link elements
  if (
    node === (sandbox as Node | null) ||
    isHTMLScriptElement(node, ownerWindow) ||
    isHTMLStyleElement(node, ownerWindow) ||
    isHTMLLinkElement(node, ownerWindow) ||
    (parentComputedStyles !== null && filter && !filter(node))
  ) {
    // Return a sentinel — callers check for undefined child
    return Promise.resolve(undefined as unknown as Element)
  }

  return makeNodeCopy(node).then(clone => {
    if (options.adjustClonedNode) {
      options.adjustClonedNode(node, clone, false)
    }
    return cloneChildren(clone, getParentOfChildren(node))
  }).then(clone => {
    if (options.adjustClonedNode) {
      options.adjustClonedNode(node, clone, true)
    }
    return clone
  }).then(clone => processClone(clone, node))

  function makeNodeCopy(original: Node): Promise<Element> {
    if (isHTMLCanvasElement(original, ownerWindow)) {
      return makeImage(
        (original as HTMLCanvasElement).toDataURL()
      ).then(img => (img ?? document.createElement('canvas')) as Element)
    }
    return Promise.resolve(original.cloneNode(false) as Element)
  }

  function getParentOfChildren(original: Node): Node {
    if (isElementHostForOpenShadowRoot(original)) {
      return (original as Element).shadowRoot! // jump down to #shadow-root
    }
    return original
  }

  function cloneChildren(clone: Element, original: Node): Promise<Element> {
    const originalChildren = getRenderedChildren(original)
    let done: Promise<void> = Promise.resolve()

    if (originalChildren.length !== 0) {
      const originalComputedStyles = getComputedStyle(
        getRenderedParent(original) as Element
      )

      asArray(originalChildren).forEach(originalChild => {
        done = done.then(() =>
          cloneNode(originalChild, options, originalComputedStyles, ownerWindow).then(
            clonedChild => {
              if (clonedChild) {
                clone.appendChild(clonedChild)
              }
            }
          )
        )
      })
    }

    return done.then(() => clone)

    function getRenderedParent(original: Node): Node {
      if (isShadowRoot(original, ownerWindow)) {
        return (original as ShadowRoot).host // jump up from #shadow-root
      }
      return original
    }

    function getRenderedChildren(original: Node): NodeList | Node[] {
      if (isShadowSlotElement(original, ownerWindow)) {
        const assignedNodes = (original as HTMLSlotElement).assignedNodes()
        if (assignedNodes && assignedNodes.length > 0) return assignedNodes
      }
      return original.childNodes
    }
  }

  function processClone(clone: Element, original: Node): Promise<Element> {
    if (!isElement(clone, ownerWindow) || isShadowSlotElement(original, ownerWindow)) {
      return Promise.resolve(clone)
    }

    return Promise.resolve()
      .then(() => { cloneStyle(); })
      .then(() => { clonePseudoElements(); })
      .then(() => { copyUserInput(); })
      .then(() => fixSvg())
      .then(() => { fixResponsiveImages(); })
      .then(() => clone)

    function fixResponsiveImages(): void {
      if (isHTMLImageElement(clone, ownerWindow)) {
        const imgClone = clone as HTMLImageElement
        const imgOriginal = original as HTMLImageElement
        imgClone.removeAttribute('loading')

        if (imgOriginal.srcset || imgOriginal.sizes) {
          imgClone.removeAttribute('srcset')
          imgClone.removeAttribute('sizes')
          imgClone.src = imgOriginal.currentSrc || imgOriginal.src
        }
      }
    }

    function cloneStyle(): void {
      copyStyle(original as Element, clone)

      function copyFont(
        source: CSSStyleDeclaration,
        target: CSSStyleDeclaration
      ): void {
        target.font = source.font
        target.fontFamily = source.fontFamily
        target.fontFeatureSettings = source.fontFeatureSettings
        target.fontKerning = source.fontKerning
        target.fontSize = source.fontSize
        target.fontStretch = source.fontStretch
        target.fontStyle = source.fontStyle
        target.fontVariant = source.fontVariant
        target.fontVariantCaps = source.fontVariantCaps
        target.fontVariantEastAsian = source.fontVariantEastAsian
        target.fontVariantLigatures = source.fontVariantLigatures
        target.fontVariantNumeric = source.fontVariantNumeric
        target.fontVariationSettings = source.fontVariationSettings
        target.fontWeight = source.fontWeight
      }

      function copyStyle(
        sourceElement: Element,
        targetElement: Element
      ): void {
        const sourceComputedStyles = getComputedStyle(sourceElement)
        const targetEl = targetElement as HTMLElement
        if (sourceComputedStyles.cssText) {
          targetEl.style.cssText = sourceComputedStyles.cssText
          copyFont(sourceComputedStyles, targetEl.style)
        } else {
          copyUserComputedStyleFast(
            options,
            sourceElement,
            sourceComputedStyles,
            parentComputedStyles,
            targetElement
          )

          // Remove positioning of root element so it isn't captured offset
          if (parentComputedStyles === null) {
            ;['inset-block', 'inset-block-start', 'inset-block-end'].forEach(
              prop => targetEl.style.removeProperty(prop)
            )
            ;['left', 'right', 'top', 'bottom'].forEach(prop => {
              if (targetEl.style.getPropertyValue(prop)) {
                targetEl.style.setProperty(prop, '0px')
              }
            })
          }
        }
      }
    }

    function clonePseudoElements(): void {
      const cloneClassName = uid()
      ;[':before', ':after'].forEach(element => {
        clonePseudoElement(element)
      })

      function clonePseudoElement(element: string): void {
        const style = getComputedStyle(original as Element, element)
        const content = style.getPropertyValue('content')

        if (content === '' || content === 'none') {
          return
        }

        const currentClass = clone.getAttribute('class') ?? ''
        clone.setAttribute('class', `${currentClass} ${cloneClassName}`)

        const styleElement = document.createElement('style')
        styleElement.appendChild(formatPseudoElementStyle())
        clone.appendChild(styleElement)

        function formatPseudoElementStyle(): Text {
          const selector = `.${cloneClassName}:${element}`
          const cssText = style.cssText
            ? `${style.cssText} content: ${content};`
            : formatCssProperties()

          return document.createTextNode(`${selector}{${cssText}}`)

          function formatCssProperties(): string {
            const styleText = asArray(style)
              .map(formatProperty)
              .join('; ')
            return `${styleText};`

            function formatProperty(name: string): string {
              const propertyValue = style.getPropertyValue(name)
              const propertyPriority = style.getPropertyPriority(name)
                ? ' !important'
                : ''
              return `${name}: ${propertyValue}${propertyPriority}`
            }
          }
        }
      }
    }

    function copyUserInput(): void {
      if (isHTMLTextAreaElement(original, ownerWindow)) {
        ;(clone as HTMLTextAreaElement).innerHTML = (
          original as HTMLTextAreaElement
        ).value
      }
      if (isHTMLInputElement(original, ownerWindow)) {
        clone.setAttribute('value', (original as HTMLInputElement).value)
      }
    }

    // Fix #215: inline <symbol> elements referenced by <use xlink:href>
    function fixSvg(): Promise<void> {
      if (!isSVGElement(clone, ownerWindow)) return Promise.resolve()

      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

      if (isSVGRectElement(clone, ownerWindow)) {
        ;['width', 'height'].forEach(attribute => {
          const value = clone.getAttribute(attribute)
          if (value) {
            ;(clone as SVGElement & { style: CSSStyleDeclaration }).style.setProperty(
              attribute,
              value
            )
          }
        })
      }

      // Fix #215: resolve <use xlink:href="#symbol"> references
      const useElements = clone.querySelectorAll('use')
      useElements.forEach(useEl => {
        const href =
          useEl.getAttribute('href') ||
          useEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
        if (href && href.startsWith('#')) {
          const symbolId = href.slice(1)
          const symbol = ownerWindow.document.getElementById(symbolId)
          if (symbol && symbol.tagName === 'symbol') {
            // Clone symbol children into the <use> element
            Array.from(symbol.childNodes).forEach(child => {
              useEl.appendChild(child.cloneNode(true))
            })
            // Remove the reference attributes so it renders inline
            useEl.removeAttribute('href')
            useEl.removeAttributeNS('http://www.w3.org/1999/xlink', 'href')
          }
        }
      })

      return Promise.resolve()
    }
  }
}

// ---------------------------------------------------------------------------
// embedFonts
// ---------------------------------------------------------------------------

function embedFonts(node: Element): Promise<Element> {
  return resolveAllFonts().then(cssText => {
    if (cssText !== '') {
      const styleNode = document.createElement('style')
      node.appendChild(styleNode)
      styleNode.appendChild(document.createTextNode(cssText))
    }
    return node
  })
}

// ---------------------------------------------------------------------------
// inlineImages
// ---------------------------------------------------------------------------

function inlineImages(node: Element): Promise<Element> {
  return inlineAll(node).then(() => node)

  function inlineAll(n: Node): Promise<void> {
    if (!isElement(n, window)) {
      return Promise.resolve()
    }

    return inlineCSSProperty(n as Element).then(() => {
      if (isHTMLImageElement(n, window)) {
        return inlineImageElement(n as HTMLImageElement)
      } else {
        return Promise.all(
          asArray(n.childNodes).map(child => inlineAll(child))
        ).then(() => undefined)
      }
    })

    function inlineCSSProperty(el: Element): Promise<void> {
      const properties = ['background', 'background-image']
      const htmlEl = el as HTMLElement

      const tasks = properties.map(propertyName => {
        const value = htmlEl.style.getPropertyValue(propertyName)
        const priority = htmlEl.style.getPropertyPriority(propertyName)

        if (!value) {
          return Promise.resolve()
        }

        return inlineAllUrls(value).then(inlinedValue => {
          htmlEl.style.setProperty(propertyName, inlinedValue, priority)
        })
      })

      return Promise.all(tasks).then(() => undefined)
    }

    function inlineImageElement(el: HTMLImageElement): Promise<void> {
      if (isDataUrl(el.src)) {
        return Promise.resolve()
      }

      return getAndEncode(el.src).then(dataUrl => {
        return new Promise<void>(resolve => {
          el.onload = () => resolve()
          el.onerror = () => resolve()
          el.src = dataUrl
        })
      })
    }
  }
}

// ---------------------------------------------------------------------------
// URL inliner — Fix #191: always emit unquoted data URIs
// ---------------------------------------------------------------------------

const URL_REGEX = /url\(\s*(["']?)((?:\\.|[^\\)])+)\1\s*\)/gm

function shouldProcess(string: string): boolean {
  return string.search(URL_REGEX) !== -1
}

function readUrls(string: string): string[] {
  const result: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(URL_REGEX.source, URL_REGEX.flags)
  while ((match = re.exec(string)) !== null) {
    result.push(match[2]!)
  }
  return result.filter(url => !isDataUrl(url))
}

function urlAsRegex(urlValue: string): RegExp {
  return new RegExp(`url\\((["']?)(${escapeRegEx(urlValue)})\\1\\)`, 'gm')
}

// Fix #191: always emit unquoted data URIs — never re-wrap with original quotes.
// Original code: return string.replace(pattern, `url($1${dataUrl}$1)`)
// which doubles the quotes when the original CSS had single/double quotes.
function inlineUrl(
  string: string,
  url: string,
  baseUrl: string | null,
  get?: (url: string) => Promise<string>
): Promise<string> {
  return Promise.resolve(url)
    .then(urlValue => (baseUrl ? resolveUrl(urlValue, baseUrl) : urlValue))
    .then(get ?? getAndEncode)
    .then(dataUrl => {
      const pattern = urlAsRegex(url)
      // Fix #191: use unquoted data URI to avoid double-quoting
      return string.replace(pattern, `url(${dataUrl})`)
    })
}

function inlineAllUrls(
  string: string,
  baseUrl?: string | null,
  get?: (url: string) => Promise<string>
): Promise<string> {
  if (!shouldProcess(string)) {
    return Promise.resolve(string)
  }

  const urls = readUrls(string)
  let done = Promise.resolve(string)
  urls.forEach(url => {
    done = done.then(prefix => inlineUrl(prefix, url, baseUrl ?? null, get))
  })
  return done
}

// ---------------------------------------------------------------------------
// Font faces
// ---------------------------------------------------------------------------

function resolveAllFonts(): Promise<string> {
  return readAllFonts()
    .then(webFonts => Promise.all(webFonts.map(wf => wf.resolve())))
    .then(cssStrings => cssStrings.join('\n'))
}

function readAllFonts(): Promise<
  Array<{ resolve: () => Promise<string>; src: () => string }>
> {
  return Promise.resolve(asArray(document.styleSheets))
    .then(getCssRules)
    .then(selectWebFontRules)
    .then(rules => rules.map(newWebFont))

  function selectWebFontRules(cssRules: CSSRule[]): CSSFontFaceRule[] {
    return (
      cssRules.filter(
        (rule): rule is CSSFontFaceRule =>
          rule.type === CSSRule.FONT_FACE_RULE
      ) as CSSFontFaceRule[]
    ).filter(rule => shouldProcess(rule.style.getPropertyValue('src')))
  }

  function getCssRules(styleSheets: CSSStyleSheet[]): CSSRule[] {
    const cssRules: CSSRule[] = []
    styleSheets.forEach(sheet => {
      const sheetProto = Object.getPrototypeOf(sheet) as object
      if (Object.prototype.hasOwnProperty.call(sheetProto, 'cssRules')) {
        try {
          asArray((sheet as CSSStyleSheet).cssRules ?? []).forEach(
            (rule: CSSRule) => cssRules.push(rule)
          )
        } catch (e) {
          console.error(
            'dom-to-image: Error while reading CSS rules from: ' +
              (sheet as CSSStyleSheet).href,
            (e as Error).toString()
          )
        }
      }
    })
    return cssRules
  }

  function newWebFont(webFontRule: CSSFontFaceRule): {
    resolve: () => Promise<string>
    src: () => string
  } {
    return {
      resolve(): Promise<string> {
        const baseUrl =
          (webFontRule.parentStyleSheet as CSSStyleSheet | null)?.href ?? null
        return inlineAllUrls(webFontRule.cssText, baseUrl)
      },
      src(): string {
        return webFontRule.style.getPropertyValue('src')
      },
    }
  }
}

// ---------------------------------------------------------------------------
// getAndEncode — simplified Chrome/same-origin XHR (CORS paths stripped)
// ---------------------------------------------------------------------------

function getAndEncode(url: string): Promise<string> {
  let cacheEntry = urlCache.find(el => el.url === url)

  if (!cacheEntry) {
    cacheEntry = { url, promise: null! }
    urlCache.push(cacheEntry)
  }

  if (cacheEntry.promise === null) {
    let fetchUrl = url
    if (implOptions.cacheBust) {
      fetchUrl += (/\?/.test(fetchUrl) ? '&' : '?') + new Date().getTime()
    }

    cacheEntry.promise = new Promise<string>(resolve => {
      const xhr = new XMLHttpRequest()
      xhr.timeout = implOptions.httpTimeout
      xhr.onerror = placehold
      xhr.ontimeout = placehold
      xhr.onloadend = function () {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          const status = xhr.status
          if (
            (status === 0 && fetchUrl.toLowerCase().startsWith('file://')) ||
            (status >= 200 && status <= 300 && xhr.response !== null)
          ) {
            const response = xhr.response as Blob
            const reader = new FileReader()
            reader.onloadend = function () {
              resolve(reader.result as string)
            }
            try {
              reader.readAsDataURL(response)
            } catch (ex) {
              fail('Failed to read the response as Data URL: ' + String(ex))
            }
          } else {
            placehold()
          }
        }
      }

      function fail(message: string): void {
        console.error(message)
        resolve('')
      }

      function placehold(): void {
        const placeholder = implOptions.imagePlaceholder
        if (placeholder) {
          resolve(placeholder)
        } else {
          fail('Status:' + xhr.status + ' while fetching resource: ' + url)
        }
      }

      // Simplified: direct GET with no credentials (CORS paths stripped)
      xhr.open('GET', fetchUrl, true)
      xhr.responseType = 'blob'
      xhr.send()
    })
  }

  return cacheEntry.promise
}

// ---------------------------------------------------------------------------
// copyUserComputedStyleFast
// ---------------------------------------------------------------------------

function copyUserComputedStyleFast(
  options: Options,
  sourceElement: Element,
  sourceComputedStyles: CSSStyleDeclaration,
  parentComputedStyles: CSSStyleDeclaration | null,
  targetElement: Element
): void {
  const defaultStyle = implOptions.copyDefaultStyles
    ? getDefaultStyle(options, sourceElement)
    : {}
  const targetStyle = (targetElement as HTMLElement).style

  asArray(sourceComputedStyles).forEach(name => {
    if (options.filterStyles) {
      if (!options.filterStyles(sourceElement, name)) {
        return
      }
    }

    const sourceValue = sourceComputedStyles.getPropertyValue(name)
    const defaultValue = defaultStyle[name]
    const parentValue = parentComputedStyles
      ? parentComputedStyles.getPropertyValue(name)
      : undefined

    // Skip if target already has a value (set via adjustCloneNode)
    const targetValue = targetStyle.getPropertyValue(name)
    if (targetValue) return

    if (
      sourceValue !== defaultValue ||
      (parentComputedStyles && sourceValue !== parentValue)
    ) {
      const priority = sourceComputedStyles.getPropertyPriority(name)
      setStyleProperty(targetStyle, name, sourceValue, priority)
    }
  })
}

function setStyleProperty(
  targetStyle: CSSStyleDeclaration,
  name: string,
  value: string,
  priority: string
): void {
  const needsPrefixing = name === 'background-clip'
  if (priority) {
    targetStyle.setProperty(name, value, priority)
    if (needsPrefixing) {
      targetStyle.setProperty(`-webkit-${name}`, value, priority)
    }
  } else {
    targetStyle.setProperty(name, value)
    if (needsPrefixing) {
      targetStyle.setProperty(`-webkit-${name}`, value)
    }
  }
}

// ---------------------------------------------------------------------------
// getDefaultStyle / sandbox management
// ---------------------------------------------------------------------------

const ascentStoppers = [
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DETAILS', 'DIALOG',
  'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER',
  'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR',
  'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SVG', 'TABLE', 'UL',
  'math', 'svg', 'BODY', 'HEAD', 'HTML',
]

function getDefaultStyle(
  options: Options,
  sourceElement: Element
): Record<string, string> {
  const tagHierarchy = computeTagHierarchy(sourceElement)
  const tagKey = computeTagKey(tagHierarchy, options)

  if (tagNameDefaultStyles[tagKey]) {
    return tagNameDefaultStyles[tagKey]!
  }

  const sandboxWindow = ensureSandboxWindow()
  const defaultElement = constructElementHierarchy(
    sandboxWindow.document,
    [...tagHierarchy]
  )
  const defaultStyle = computeStyleForDefaults(sandboxWindow, defaultElement)
  destroyElementHierarchy(defaultElement)

  tagNameDefaultStyles[tagKey] = defaultStyle
  return defaultStyle
}

function computeTagHierarchy(node: Element): string[] {
  const tagNames: string[] = []
  let current: Node | null = node
  do {
    if (current.nodeType === ELEMENT_NODE) {
      const tagName = (current as Element).tagName
      tagNames.push(tagName)
      if (ascentStoppers.includes(tagName)) break
    }
    current = (current as Element).parentNode
  } while (current)
  return tagNames
}

function computeTagKey(tagHierarchy: string[], opts: Options): string {
  if (opts.styleCaching === 'relaxed') {
    return tagHierarchy
      .filter((_, i, a) => i === 0 || i === a.length - 1)
      .join('>')
  }
  return tagHierarchy.join('>')
}

function constructElementHierarchy(
  sandboxDocument: Document,
  tagHierarchy: string[]
): Element {
  let element: Element = sandboxDocument.body
  do {
    const childTagName = tagHierarchy.pop()!
    const childElement = sandboxDocument.createElement(childTagName)
    element.appendChild(childElement)
    element = childElement
  } while (tagHierarchy.length > 0)
  element.textContent = '\u200b'
  return element
}

function computeStyleForDefaults(
  sandboxWin: Window & typeof globalThis,
  defaultElement: Element
): Record<string, string> {
  const defaultStyleObj: Record<string, string> = {}
  const defaultComputedStyle = sandboxWin.getComputedStyle(defaultElement)

  asArray(defaultComputedStyle).forEach(name => {
    defaultStyleObj[name] =
      name === 'width' || name === 'height'
        ? 'auto'
        : defaultComputedStyle.getPropertyValue(name)
  })
  return defaultStyleObj
}

function destroyElementHierarchy(element: Element | null): void {
  let el: Element | null = element
  do {
    const parentElement = el?.parentElement ?? null
    if (parentElement !== null && el !== null) {
      parentElement.removeChild(el)
    }
    el = parentElement
  } while (el && el.tagName !== 'BODY')
}

function ensureSandboxWindow(): Window & typeof globalThis {
  if (sandbox) {
    return sandbox.contentWindow as Window & typeof globalThis
  }

  const charsetToUse = document.characterSet || 'UTF-8'
  const docType = document.doctype
  const docTypeDeclaration = docType
    ? `<!DOCTYPE ${escapeHTML(docType.name)} ${escapeHTML(
        docType.publicId
      )} ${escapeHTML(docType.systemId)}`.trim() + '>'
    : ''

  sandbox = document.createElement('iframe')
  sandbox.id = 'domtoimage-sandbox-' + uid()
  sandbox.style.top = '-9999px'
  sandbox.style.visibility = 'hidden'
  sandbox.style.position = 'fixed'
  document.body.appendChild(sandbox)

  return tryTechniques(sandbox, docTypeDeclaration, charsetToUse, 'domtoimage-sandbox')
}

function escapeHTML(unsafeText: string | undefined | null): string {
  if (unsafeText) {
    const div = document.createElement('div')
    div.innerText = unsafeText
    return div.innerHTML
  }
  return ''
}

function tryTechniques(
  sb: HTMLIFrameElement,
  doctype: string,
  charset: string,
  title: string
): Window & typeof globalThis {
  try {
    ;(sb.contentWindow as Window & typeof globalThis).document.write(
      `${doctype}<html><head><meta charset='${charset}'><title>${title}</title></head><body></body></html>`
    )
    return sb.contentWindow as Window & typeof globalThis
  } catch (_) {
    // fall through
  }

  const metaCharset = document.createElement('meta')
  metaCharset.setAttribute('charset', charset)

  try {
    const sandboxDocument = document.implementation.createHTMLDocument(title)
    sandboxDocument.head.appendChild(metaCharset)
    const sandboxHTML = doctype + sandboxDocument.documentElement.outerHTML
    sb.setAttribute('srcdoc', sandboxHTML)
    return sb.contentWindow as Window & typeof globalThis
  } catch (_) {
    // fall through
  }

  sb.contentDocument!.head.appendChild(metaCharset)
  sb.contentDocument!.title = title
  return sb.contentWindow as Window & typeof globalThis
}

function removeSandbox(): void {
  if (sandbox) {
    document.body.removeChild(sandbox)
    sandbox = null
  }

  if (removeDefaultStylesTimeoutId) {
    clearTimeout(removeDefaultStylesTimeoutId)
  }

  removeDefaultStylesTimeoutId = setTimeout(() => {
    removeDefaultStylesTimeoutId = null
    tagNameDefaultStyles = {}
  }, 20 * 1000)
}

// ---------------------------------------------------------------------------
// copyOptions
// ---------------------------------------------------------------------------

function copyOptions(options: Options): void {
  implOptions.copyDefaultStyles = options.copyDefaultStyles ?? true
  implOptions.imagePlaceholder = undefined
  implOptions.cacheBust = false
  implOptions.httpTimeout = 30000
  implOptions.styleCaching = options.styleCaching ?? 'strict'
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

let uidIndex = 0

function uid(): string {
  return `u${fourRandomChars()}${uidIndex++}`
}

function fourRandomChars(): string {
  return `0000${((Math.random() * Math.pow(36, 4)) << 0).toString(36)}`.slice(-4)
}

function escapeRegEx(string: string): string {
  return string.replace(/([.*+?^${}()|[\]/\\])/g, '\\$1')
}

function asArray<T>(arrayLike: ArrayLike<T>): T[] {
  const array: T[] = []
  const length = arrayLike.length
  for (let i = 0; i < length; i++) {
    array.push(arrayLike[i]!)
  }
  return array
}

function escapeXhtml(string: string): string {
  return string
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/\n/g, '%0A')
}

function isDataUrl(url: string): boolean {
  return url.search(/^(data:)/) !== -1
}

function isDimensionMissing(value: number): boolean {
  return isNaN(value) || value <= 0
}

function resolveUrl(url: string, baseUrl: string): string {
  const doc = document.implementation.createHTMLDocument()
  const base = doc.createElement('base')
  doc.head.appendChild(base)
  const a = doc.createElement('a')
  doc.body.appendChild(a)
  base.href = baseUrl
  a.href = url
  return a.href
}

function width(node: Element): number {
  const w = px(node, 'width')
  if (!isNaN(w)) return w
  const leftBorder = px(node, 'border-left-width')
  const rightBorder = px(node, 'border-right-width')
  return node.scrollWidth + leftBorder + rightBorder
}

function height(node: Element): number {
  const h = px(node, 'height')
  if (!isNaN(h)) return h
  const topBorder = px(node, 'border-top-width')
  const bottomBorder = px(node, 'border-bottom-width')
  return node.scrollHeight + topBorder + bottomBorder
}

function px(node: Element, styleProperty: string): number {
  if (node.nodeType === ELEMENT_NODE) {
    let value = getComputedStyle(node).getPropertyValue(styleProperty)
    if (value.slice(-2) === 'px') {
      value = value.slice(0, -2)
      return parseFloat(value)
    }
  }
  return NaN
}

function getWindow(node: Node): Window & typeof globalThis {
  const ownerDocument = node
    ? (node.ownerDocument ?? undefined)
    : undefined
  return (
    (ownerDocument ? ownerDocument.defaultView ?? undefined : undefined) ??
    window
  )
}

function isElement(value: Node, win: Window & typeof globalThis): value is Element {
  return value instanceof win.Element
}

function isElementHostForOpenShadowRoot(value: Node): boolean {
  return value instanceof Element && (value as Element).shadowRoot !== null
}

function isShadowRoot(
  value: Node,
  win: Window & typeof globalThis
): boolean {
  return value instanceof win.ShadowRoot
}

function isInShadowRoot(
  value: Node | null | undefined,
  win: Window & typeof globalThis
): boolean {
  if (
    value === null ||
    value === undefined ||
    typeof (value as Node & { getRootNode?: unknown }).getRootNode !== 'function'
  )
    return false
  return isShadowRoot((value as Node).getRootNode(), win)
}

function isHTMLCanvasElement(
  value: Node,
  win: Window & typeof globalThis
): value is HTMLCanvasElement {
  return value instanceof win.HTMLCanvasElement
}

function isHTMLImageElement(
  value: Node,
  win: Window & typeof globalThis
): value is HTMLImageElement {
  return value instanceof win.HTMLImageElement
}

function isHTMLInputElement(
  value: Node,
  win: Window & typeof globalThis
): value is HTMLInputElement {
  return value instanceof win.HTMLInputElement
}

function isHTMLLinkElement(
  value: Node,
  win: Window & typeof globalThis
): value is HTMLLinkElement {
  return value instanceof win.HTMLLinkElement
}

function isHTMLScriptElement(
  value: Node,
  win: Window & typeof globalThis
): value is HTMLScriptElement {
  return value instanceof win.HTMLScriptElement
}

function isHTMLStyleElement(
  value: Node,
  win: Window & typeof globalThis
): value is HTMLStyleElement {
  return value instanceof win.HTMLStyleElement
}

function isHTMLTextAreaElement(
  value: Node,
  win: Window & typeof globalThis
): value is HTMLTextAreaElement {
  return value instanceof win.HTMLTextAreaElement
}

function isShadowSlotElement(
  value: Node,
  win: Window & typeof globalThis
): boolean {
  return isInShadowRoot(value, win) && value instanceof win.HTMLSlotElement
}

function isSVGElement(
  value: Node,
  win: Window & typeof globalThis
): value is SVGElement {
  return value instanceof win.SVGElement
}

function isSVGRectElement(
  value: Node,
  win: Window & typeof globalThis
): value is SVGRectElement {
  return value instanceof win.SVGRectElement
}
