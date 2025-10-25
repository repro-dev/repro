export type CSSPropertyMap = {
  [key: string]: string
}

export interface GroupedCSSPropertyMap {
  name: string
  propertyMap: CSSPropertyMap
}

type Side = 'top' | 'right' | 'bottom' | 'left'

export function createCSSPropertyMap(styles: CSSStyleDeclaration) {
  return (
    Array.from(styles) as Array<keyof CSSStyleDeclaration>
  ).reduce<CSSPropertyMap>((acc, key) => {
    const value = styles[key]

    if (typeof value === 'string') {
      acc[key] = value
    }

    return acc
  }, {} as CSSPropertyMap)
}

export function createGroupedCSSPropertyMap(
  styleMap: CSSPropertyMap
): Array<GroupedCSSPropertyMap> {
  const layoutPropertyMap: CSSPropertyMap = {}
  const appearancePropertyMap: CSSPropertyMap = {}
  const textPropertyMap: CSSPropertyMap = {}
  const stackingPropertyMap: CSSPropertyMap = {}
  const animationPropertyMap: CSSPropertyMap = {}
  const otherPropertyMap: CSSPropertyMap = {}

  if (hasPadding(styleMap)) {
    layoutPropertyMap['padding'] = getShorthandBoxPropertyValue(
      getPadding(styleMap)
    )
  }

  if (hasMargin(styleMap)) {
    layoutPropertyMap['margin'] = getShorthandBoxPropertyValue(
      getMargin(styleMap)
    )
  }

  for (const side of ['top', 'right', 'bottom', 'left'] as Array<Side>) {
    if (hasBorder(styleMap, side)) {
      appearancePropertyMap[`border-${side}`] = getShorthandBorderPropertyValue(
        styleMap,
        side
      )
    }
  }

  if (hasOutline(styleMap)) {
    appearancePropertyMap['outline'] =
      getShorthandOutlinePropertyValue(styleMap)
  }

  for (const [key, value] of Object.entries(styleMap)) {
    if (ignoredProperties.includes(key)) {
      continue
    }

    if (
      key.startsWith('padding') ||
      key.startsWith('margin') ||
      key.startsWith('border') ||
      key.startsWith('outline')
    ) {
      continue
    }

    if (layoutProperties.includes(key)) {
      layoutPropertyMap[key] = value
    } else if (appearanceProperties.includes(key)) {
      appearancePropertyMap[key] = value
    } else if (textProperties.includes(key)) {
      textPropertyMap[key] = value
    } else if (stackingProperties.includes(key)) {
      stackingPropertyMap[key] = value
    } else if (animationProperties.includes(key)) {
      animationPropertyMap[key] = value
    } else {
      otherPropertyMap[key] = value
    }
  }

  return [
    { name: 'layout', propertyMap: layoutPropertyMap },
    { name: 'text', propertyMap: textPropertyMap },
    { name: 'appearance', propertyMap: appearancePropertyMap },
    { name: 'stacking', propertyMap: stackingPropertyMap },
    { name: 'animation', propertyMap: animationPropertyMap },
    { name: 'other', propertyMap: otherPropertyMap },
  ]
}

function hasBorder(styleMap: CSSPropertyMap, side: Side) {
  return styleMap.hasOwnProperty(`border-${side}-width`)
}

function hasOutline(styleMap: CSSPropertyMap) {
  return styleMap.hasOwnProperty('outline-width')
}

function hasMargin(styleMap: CSSPropertyMap) {
  return (
    styleMap.hasOwnProperty('margin-left') ||
    styleMap.hasOwnProperty('margin-top') ||
    styleMap.hasOwnProperty('margin-right') ||
    styleMap.hasOwnProperty('margin-bottom')
  )
}

function hasPadding(styleMap: CSSPropertyMap) {
  return (
    styleMap.hasOwnProperty('padding-left') ||
    styleMap.hasOwnProperty('padding-top') ||
    styleMap.hasOwnProperty('padding-right') ||
    styleMap.hasOwnProperty('padding-bottom')
  )
}

type Box = Record<Side, number>

function getMargin(styleMap: CSSPropertyMap): Box {
  return {
    left: resolveValue(styleMap['margin-left']),
    right: resolveValue(styleMap['margin-right']),
    top: resolveValue(styleMap['margin-top']),
    bottom: resolveValue(styleMap['margin-bottom']),
  }
}

function getPadding(styleMap: CSSPropertyMap) {
  return {
    left: resolveValue(styleMap['padding-left']),
    right: resolveValue(styleMap['padding-right']),
    top: resolveValue(styleMap['padding-top']),
    bottom: resolveValue(styleMap['padding-bottom']),
  }
}

function resolveValue(value: string | undefined): number {
  return value !== undefined
    ? parseInt(value.substring(0, value.length - 2), 10) || 0
    : 0
}

function getShorthandBoxPropertyValue(box: Box) {
  let propertyValue = `${box.top}px`

  if (box.left !== box.right) {
    propertyValue += ` ${box.right}px ${box.bottom}px ${box.left}px`
  } else if (box.top !== box.bottom) {
    propertyValue += ` ${box.right}px ${box.bottom}px`
  } else if (box.top !== box.right) {
    propertyValue += ` ${box.right}px`
  }

  return propertyValue
}

function getShorthandBorderPropertyValue(styleMap: CSSPropertyMap, side: Side) {
  const width = styleMap[`border-${side}-width`]
  const style = styleMap[`border-${side}-style`]
  const color = styleMap[`border-${side}-color`]
  return `${width} ${style} ${color}`
}

function getShorthandOutlinePropertyValue(styleMap: CSSPropertyMap) {
  const width = styleMap['outline-width']
  const style = styleMap['outline-style']
  const color = styleMap['outline-color']
  return `${width} ${style} ${color}`
}

const layoutProperties = [
  'align-items',
  'align-self',
  'bottom',
  'box-sizing',
  'column',
  'columns',
  'column-gap',
  'display',
  'flex',
  'flex-basis',
  'flex-grow',
  'flex-shrink',
  'gap',
  'grid',
  'grid-area',
  'grid-column',
  'grid-column-gap',
  'grid-row',
  'grid-row-gap',
  'grid-template-areas',
  'grid-template-columns',
  'grid-template-rows',
  'justify-content',
  'justify-items',
  'justify-self',
  'left',
  'height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-bottom',
  'perspective',
  'perspective-origin',
  'position',
  'right',
  'top',
  'transform',
  'transform-origin',
  'width',
]

const stackingProperties = ['isolation', 'z-index']

const textProperties = [
  'color',
  'direction',
  'font',
  'font-family',
  'font-size',
  'font-variant',
  'font-weight',
  'font-width',
  'letter-spacing',
  'line-height',
  'overflow-wrap',
  'tab-size',
  'text-align',
  'text-decoration',
  'text-rendering',
  'text-shadow',
  'text-size-adjust',
  'text-transform',
]

const appearanceProperties = [
  'background',
  'background-attachment',
  'background-color',
  'background-image',
  'background-repeat',
  'border',
  'border-bottom',
  'border-left',
  'border-radius',
  'border-right',
  'border-top',
  'box-shadow',
  'opacity',
  'outline',
  'visibility',
]

const animationProperties = [
  'animation',
  'animation-delay',
  'animation-direction',
  'animation-duration',
  'animation-fill-mode',
  'animation-iteration-count',
  'animation-name',
  'animation-play-state',
  'animation-timing-function',
  'transition',
  'transition-delay',
  'transition-duration',
  'transition-timing-function',
]

const ignoredProperties = [
  'block-size',
  'inline-size',
  'max-block-size',
  'max-inline-size',
]
