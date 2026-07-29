---
name: pen-design
description: Load when designing or modifying .pen files, creating screens, reusable components, or any pen.dev design work. Covers pen CLI headless mode, batch_design DSL, schema, component patterns, and pen-export configuration.
---

# Pen Design

Agentic workflow for `.pen` design files — screen creation, reusable components, design tokens, and export.

## Tool Selection: CLI vs MCP

**Pen CLI is the primary agentic tool.** Use `pen interactive --in <file.pen> --out <file.pen>` in headless mode for all `.pen` file manipulation. It provides the same `batch_design` / `batch_get` / `get_editor_state` API without requiring the Pencil desktop app.

**MCP tools require the Pencil desktop app open.** Use `pencil_batch_design`, `pencil_batch_get`, `pencil_get_app_state` etc. ONLY when:
- You need `pencil_browser` to import live page layouts from a running app
- You need `pencil_get_screenshot` for visual verification in real-time
- The app is already open and you're doing interactive design

**Never use `Read` or `Grep` on `.pen` files** — they are encrypted blobs.

### Headless CLI (always preferred for agents)

```bash
echo '
// batch_design JavaScript here
save()
' | pen interactive --in repro.pen --out repro.pen 2>&1
```

- Commands are piped to stdin; the shell prints output then exits
- Use `save()` to persist changes to the output file
- Input and output can be the same file (in-place editing)
- Append `2>&1` to capture both stdout and stderr

### Multi-step workflows

Pipe multiple commands separated by newlines:

```bash
echo '
get_editor_state({ include_schema: false })
save()
' | pen interactive --in repro.pen --out repro.pen 2>&1
```

Each `batch_design` call is executed in its own scope. Persist values between calls by omitting `const`/`let` (bare assignment creates a global):

```js
pos = FindEmptySpace({ width: 960, height: 800, direction: "right", padding: 80 })
page = Insert(document, { type: "frame", name: "Screen: Foo – Result", x: pos.x, y: pos.y, layout: "vertical", width: 960, placeholder: true })
```

## batch_design API

The `batch_design` tool executes JavaScript snippets. Full API:

```
const document: string;  // predefined root node

Insert(parent, nodeData) → string      // insert node, returns new ID
Copy(path, parent, copyNodeData) → string  // copy node, returns new ID
Update(path, updateData) → void        // update node properties
Replace(path, nodeData) → string       // replace node, returns new ID
Move(path, parent?, index?) → void     // move node
Delete(path) → void                    // delete node
SetVariables(variables, replace?) → void  // define/update variables
Generate(nodeId, type, prompt) → void  // generate AI/stock image fill
FindEmptySpace({width, height, direction?, padding?, nodeId?}) → {x, y, parentId?}
```

### Insert

```js
btn = Insert(document, { type: "frame", name: "Button", x: 100, y: 100, reusable: true, layout: "horizontal", padding: 12, gap: 8, fill: "$bg-brand" })
Insert(btn, { type: "text", name: "Label", fontFamily: "Inter", fontSize: 14, fill: "$text-on-brand", content: "Submit" })
```

- Never set `id` — Pencil generates unique IDs automatically
- Always set `name` on every node
- Returns the string ID for use in subsequent calls

### Component instances (ref)

Use existing reusable components via `ref`:

```js
card = Insert(page, { type: "ref", ref: "JFccj", name: "Account Card", width: "fill_container" })
Update(card + "/someChildId", { content: "Custom title" })
```

Override descendant properties in component instances:
- `descendants` map on `Insert`/`Copy`: `descendants: { "childId": { content: "Override" } }`
- `Update(instanceId + "/childId", { ... })` for post-insertion overrides
- `Replace(instanceId + "/childId", { type: "frame", ... })` for swapping slots

### FindEmptySpace

Always use before placing top-level frames at document root:

```js
pos = FindEmptySpace({ width: 960, height: 800, direction: "right", padding: 80 })
screen = Insert(document, { type: "frame", name: "Screen: Foo", x: pos.x, y: pos.y, ... })
```

For sequential screens, chain via `nodeId`:

```js
pos2 = FindEmptySpace({ width: 960, height: 800, direction: "right", padding: 80, nodeId: screen })
screen2 = Insert(pos2.parentId || document, { type: "frame", name: "Screen: Bar", x: pos2.x, y: pos2.y, ... })
```

## Schema Quick Reference

Full schema available via `get_editor_state({ include_schema: true })`. Key types:

| Type | Description | Unique properties |
|------|-------------|-------------------|
| `frame` | Container with layout, children | `layout`, `clip`, `padding`, `gap`, `reusable`, `placeholder`, `slot` |
| `text` | Text content | `content`, `fontFamily`, `fontSize`, `fill`, `textGrowth` |
| `ref` | Component instance | `ref` (component ID), `descendants` |
| `group` | Non-layout container | `children` |
| `rectangle` | Shape | `fill`, `cornerRadius` |
| `ellipse` | Ellipse/circle | `fill`, `innerRadius`, `startAngle`, `sweepAngle` |
| `icon` | Icon from library | `library`, `icon`, `fill` |
| `path` | SVG path | `geometry`, `viewBox` |
| `script` | JS-generated children | `scriptUri`, `inputs` |

### Layout

- `layout: "vertical" | "horizontal" | "none"` — flex direction
- `gap`: spacing between children
- `padding`: number, `[v, h]`, or `[top, right, bottom, left]`
- `justifyContent: "start" | "center" | "end" | "space_between" | "space_around"`
- `alignItems: "start" | "center" | "end"`

**Not supported**: `baseline`, `stretch`, `margin`, percentage sizes, CSS values.

### Sizing

- `fit_content` — size to children (requires layout on the node)
- `fill_container` — fill parent (requires layout on the parent)
- Fixed pixel values: `width: 960, height: 400`

**Never hardcode heights** when content can drive sizing. Use `fit_content` for content-driven screens.

```js
// ✅ GOOD: content-driven height
screen = Insert(document, { type: "frame", name: "Screen", layout: "vertical", width: 960 })

// ❌ BAD: arbitrary hardcoded height
screen = Insert(document, { type: "frame", name: "Screen", layout: "vertical", width: 960, height: 1200 })
```

### Text

- Text is invisible without `fill` — always set it
- `textGrowth: "auto"` (default) — single line, width/height ignored
- `textGrowth: "fixed-width"` — line-wraps; MUST set `width`
- `textGrowth: "fixed-width-height"` — both `width` and `height` required
- `lineHeight`: ratio relative to fontSize (e.g. `1.5` = 150%)

```js
// Heading that fills parent width, wraps
Insert(parent, { type: "text", name: "Title", textGrowth: "fixed-width", width: "fill_container", fontFamily: "Inter", fontSize: 24, fill: "$text-primary", content: "Sessions" })

// Single-line button label, no explicit width
Insert(btn, { type: "text", name: "Label", fontFamily: "Inter", fontSize: 14, fill: "$text-on-brand", content: "Save" })
```

## Common Patterns

### Create a reusable component

Create in its own `batch_design` to capture the generated ID:

```js
pos = FindEmptySpace({ width: 240, height: 96, direction: "top", padding: 80 })
card = Insert(document, { type: "frame", name: "MetricCard", x: pos.x, y: pos.y, reusable: true, layout: "vertical", gap: 4, padding: 16, fill: "$bg-surface", cornerRadius: 8, placeholder: true })
label = Insert(card, { type: "text", name: "Label", fontFamily: "Inter", fontSize: 13, fill: "$text-secondary", content: "Label" })
value = Insert(card, { type: "text", name: "Value", fontFamily: "Inter", fontSize: 28, fill: "$text-primary", content: "0" })
Update(card, { placeholder: false })
```

### Create a screen frame

```js
pos = FindEmptySpace({ width: 960, height: 600, direction: "right", padding: 80 })
screen = Insert(document, { type: "frame", name: "Screen: Dashboard – Result", x: pos.x, y: pos.y, layout: "vertical", width: 960, clip: true, placeholder: true })

header = Insert(screen, { type: "frame", name: "Header", layout: "horizontal", alignItems: "center", justifyContent: "space-between", width: "fill_container", padding: [24, 32] })
Insert(header, { type: "text", name: "Title", textGrowth: "fixed-width", width: "fill_container", fontFamily: "Inter", fontSize: 22, fill: "$text-primary", content: "Dashboard" })

body = Insert(screen, { type: "frame", name: "Body", layout: "vertical", width: "fill_container", padding: [24, 32], gap: 16 })

Update(screen, { placeholder: false })
```

### Create a table with data rows

```js
table = Insert(body, { type: "ref", ref: "x1LAI", name: "Sessions Table", width: "fill_container" })

headers = ["Name", "URL", "Duration", "Date"]
data = [["Session 1", "example.com/page", "2m 30s", "Jul 28, 2026"], ["Session 2", "test.com", "1m 15s", "Jul 27, 2026"]]

// Build header row
headerRow = Insert(table, { type: "frame", name: "Header Row", layout: "horizontal", width: "fill_container" })
for (const h of headers) {
  Insert(headerRow, { type: "text", name: h, textGrowth: "fixed-width", width: "fill_container", fontFamily: "Inter", fontSize: 12, fontWeight: "600", fill: "$text-secondary", content: h })
}

// Build data rows
for (const row of data) {
  dataRow = Insert(table, { type: "frame", name: "Data Row", layout: "horizontal", width: "fill_container" })
  for (const cell of row) {
    Insert(dataRow, { type: "text", name: cell, textGrowth: "fixed-width", width: "fill_container", fontFamily: "Inter", fontSize: 14, fill: "$text-primary", content: cell })
  }
}
```

### Read existing variables

```js
// In a separate call:
echo 'get_variables()' | pen interactive --in repro.pen --out repro.pen 2>&1
```

Reference variables with `$` prefix: `fill: "$text-primary"`, `gap: "$spacing-md"`.

## State Separation

Each UI state is a separate top-level frame, not a child of a screen frame:

```
Screen: Sessions Dashboard – Result
Screen: Sessions Dashboard – Empty
Screen: Sessions Dashboard – Loading
Screen: Sessions Dashboard – Error
```

Each gets its own entry in `scripts/pen-export.json`.

## pen-export Configuration

`scripts/pen-export.json` registers screens for batch export. Each entry:

```json
{
  "id": "<pencil-frame-id>",
  "name": "Screen: Dashboard – Result",
  "outputName": "dashboard-result",
  "width": 960,
  "height": "auto"
}
```

Run with: `pnpm run pen:export`

## Design Conventions for Agents

- **Use existing reusable components** — read `get_editor_state` first to find them
- **New reusable components** — `reusable: true`, placed at document root, add to Component Gallery
- **`placeholder: true`** — set during construction, remove when done
- **Clip screens** — `clip: true` on screen frames to prevent overflow
- **Design token references** — `$text-primary`, `$bg-surface`, `$spacing-md`, not hardcoded colors/spacing
- **Never set `id`** — let Pencil generate unique IDs

## NEVER

- Use `Read` or `Grep` on `.pen` files (encrypted)
- Use MCP tools when the Pencil app is not open (CLI is the headless fallback)
- Hardcode pixel heights on screen frames (use `fit_content`)
- Bundle multiple states as children of a single screen frame
- Set `id` properties on new nodes
- Use percentage or CSS values for `width`/`height`
- Set `alignItems: "baseline"` or `"stretch"` (not supported)
- Use `margin` (not supported — use `padding` on wrapping frame instead)
