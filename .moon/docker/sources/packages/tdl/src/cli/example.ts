import { compile } from './compiler'
import { buildAST } from './parser/buildAST'

const input = `
import point.Point
import vdom.{NodeId, VElement}

type InteractionType: enum<uint8> {
  ViewportResize: 0
  Scroll: 1
  PointerMove: 2
  PointerDown: 3
  PointerUp: 4
  KeyDown: 5
  KeyUp: 6
  Click: 7
  DoubleClick: 8
  PageTransition: 9
}

type ViewportResize: struct {
  0) type: InteractionType.ViewportResize
  1) from: Point
  2) to: Point
  3) duration: uint16
}

type ScrollMap: map<NodeId, Point>

type Scroll: struct {
  0) type: InteractionType.Scroll
  1) target: NodeId
  2) from: Point
  3) to: Point
  4) duration: uint16
}

type PointerMove: struct {
  0) type: InteractionType.PointerMove
  1) from: Point
  2) to: Point
  3) duration: uint16
}

type PointerState: enum<uint8> {
  Up: 0
  Down: 1
}

type PointerDown: struct {
  0) type: InteractionType.PointerDown
  1) targets: vector<NodeId>
  2) at: Point
}

type PointerUp: struct {
  0) type: InteractionType.PointerUp
  1) targets: vector<NodeId>
  2) at: Point
}

type KeyDown: struct {
  0) type: InteractionType.KeyDown
  1) key: string
}

type KeyUp: struct {
  0) type: Interaction.KeyUp
  1) key: string
}

type MouseButton: enum<uint8> {
  Primary: 0
  Auxiliary: 1
  Secondary: 2
  Fourth: 3
  Fifth: 4
}

type Click: struct {
  0) type: InteractionType.Click
  1) button: MouseButton
  2) targets: vector<NodeId>
  3) at: Point
  4) meta: struct {
    0) node: VElement
    1) humanReadableLabel: ?string
  }
}

type DoubleClick: struct {
  0) type: InteractionType.DoubleClick
  1) button: MouseButton
  2) targets: vector<NodeId>
  3) at: Point
  4) meta: struct {
    0) node: VElement
    1) humanReadableLabel: ?string
  }
}

type PageTransition: struct {
  0) type: InteractionType.PageTransition
  1) from: ?string
  2) to: string
}

type Interaction: union(type: uint8) {
  ViewportResize
  Scroll
  PointerMove
  PointerDown
  PointerUp
  KeyDown
  KeyUp
  Click
  DoubleClick
  PageTransition
}
`

console.log(compile(buildAST(input)))
