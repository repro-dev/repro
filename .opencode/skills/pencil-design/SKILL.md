---
name: pencil-design
description: Work with .pen (Pen) design files — CLI headless mode, MCP tool usage, multi-file architecture, variable-based tokens, export for review, and batch processing. Load when creating, editing, or manipulating .pen design files, or when a UI change requires a corresponding design file per the design-before-implementation rule.
---

# Pen Design

Reference for working with `.pen` design files (Pen, formerly Pencil) in the Repro codebase. `.pen` files are encrypted design artifacts that serve as the source of truth for UI work — they define the intended output before any code is written.

## CLI Headless Mode

The `pen` CLI handles `.pen` files without the Pen desktop app. Use these commands for automation, CI, or when the desktop app isn't available.

| Command | Purpose |
|---|---|
| `pen --in <input.pen> --out <output.pen> --prompt "<design instructions>"` | Headless design generation — applies a text prompt to modify a `.pen` file |
| `pen --in <input.pen> --out <output.png>` | Export a `.pen` file directly to a PNG image |
| `pen --in <input.pen> --out <output.pdf>` | Export a `.pen` file to a PDF document |

CLI mode is the fallback when the desktop app isn't running. It supports the same file format and rendering engine, so outputs are identical to what the app would produce.

## MCP Tool Reference

Use the `pencil` MCP tools to interact with `.pen` files. The Pen desktop app must be running for MCP access.

### Required first call

```typescript
pencil_get_app_state({
  include_schema: true,
  include_canvas_design: true,
  include_scripts_and_shaders: false,
  include_browser: false
})
```

This returns the current canvas state and the `.pen` file schema. All four flags are required. Call this first — you need the schema to construct valid commands for other tools.

### Core tools

| Tool | Signature | Use |
|---|---|---|
| `pencil_execute` | `({ filePath, input })` | Execute Pen DSL commands on a `.pen` file. Requires `get_app_state` with schema first — the input commands must match the schema. |
| `pencil_get_screenshot` | `({ filePath, nodeId })` | Take a screenshot of a node. Use `nodeId: "document"` for the full document. Use for review evidence. |
| `pencil_export_nodes` | `({ filePath, nodeIds, outputDir, format: "png" })` | Export specific nodes as PNG images. Accepts an array of node IDs. |
| `pencil_export_html` | `({ filePath, nodeIds, outputPath, format: "html-tailwind" })` | Export nodes as HTML (Tailwind or plain CSS). Supports full HTML scaffold. |
| `pencil_browser` | `({ filePath, action: "load-page", url })` | Load a URL in Pen's integrated browser. Useful for importing live pages as canvas layers. |

### Browser integration tools

| Tool | Use |
|---|---|
| `pencil_browser({ filePath, action: "import-to-canvas", target: "query", querySelector })` | Reproduce a page element as editable canvas layers |
| `pencil_browser({ filePath, action: "screenshot-to-canvas", target })` | Place a page screenshot on the canvas |
| `pencil_browser({ filePath, action: "return-element", target, querySelector })` | Return DOM and computed styles as text |
| `pencil_browser({ filePath, action: "return-screenshot", target, querySelector })` | Return a screenshot for visual inspection |

Valid `target` values: `"full-page"`, `"selection"`, `"query"` (use `querySelector` for the latter).

## Multi-File Architecture

`.pen` files follow a library-and-screens architecture:

- **Library files** (`design-system.lib.pen`): Store shared components, variants, and tokens. These are the design-system building blocks that can be composed across multiple screens. New UI components should be added here first.
- **Screen files** (`<feature>.pen`): Compose library components into specific screens or pages. Each feature or screen gets its own file.

### When to create vs extend

| Situation | Action |
|---|---|
| New UI component (button, card, input) | Add to `design-system.lib.pen` |
| New variant of an existing component | Add variant in `design-system.lib.pen` |
| New screen or page | Create `<feature>.pen` that imports from library |
| New prototype or exploration | Create a standalone `<wip-feature>.pen`; promote to library components on stabilization |

Always process files in dependency order: library first, then screens.

## Variable-Based Tokens

`.pen` files support variables for consistent token usage across designs.

- **Define variables** in the library file's variable panel. Tokens (colors, spacing, radii, fonts) should match the project's DESIGN.md tokens.
- **Reference variables** by name in screen files — this keeps tokens synchronized and avoids hardcoded values.
- **Naming convention**: Follow the existing project token naming from DESIGN.md (e.g. `color-primary`, `spacing-md`, `radius-sm`). When no DESIGN.md exists yet, use descriptive names grouped by concern: `color-*`, `spacing-*`, `radius-*`, `font-*`.
- **Scope**: Library-level variables are available to all importing screen files. Screen-level variables are local to that screen.

## Design-Before-Implementation Rule

Any UI change must follow this sequence:

1. **Design**: Represent the intended output in a `.pen` file. Create or update the screen file in the `designs/` directory matching the feature area.
2. **Review**: The agent generates the design, takes a screenshot with `pencil_get_screenshot`, and presents it for human review.
3. **Approve**: Human reviews and approves the design.
4. **Implement**: Write the implementation code matching the approved design.

The `.pen` file defines the intended output; code follows it. Commit `.pen` files alongside code in PRs — they are source-of-truth artifacts, not auxiliary assets.

## Human Review Handoff

For agent-driven design work:

1. Agent generates or modifies the `.pen` file using `pencil_execute`.
2. Agent takes a screenshot using `pencil_get_screenshot({ filePath, nodeId: "document" })` or `pencil_export_nodes`.
3. Screenshot is saved to `tmp/` for review (e.g. `tmp/<feature>-design.png`).
4. Human reviews the screenshot and approves or requests changes.
5. Agent iterates on the design if changes are requested.
6. Once approved, agent proceeds to implementation.

## Batch Processing

For multi-file or bulk operations, use these patterns:

- **Dependency ordering**: Process library files first, then screen files that depend on them.
- **Batch export**: Use `pencil_export_nodes` with multiple `nodeIds` to export several assets in one call.
- **Batch design commands**: Use `pencil_execute` with `.pen` files sequentially when cross-file coordination is needed (e.g. propagating a token change from library to all screens).

## Troubleshooting: Pen Desktop App Not Running

The MCP tools require the Pen desktop app (formerly Pencil) to be running for network-based access.

| Symptom | Likely cause | Resolution |
|---|---|---|
| MCP tools return connection refused or timeout errors | Pen desktop app is not running | Start the Pen desktop app |
| `pen` command not found | CLI not installed | Install via `npm install -g @pen/pen` or the project's package manager |
| Neither MCP nor CLI work | Environment issue | Defer `.pen` work until Pen is available; note the blocker in the project context |

If neither the desktop app nor the CLI is available, defer `.pen` work until Pen is available. Do not attempt to edit `.pen` files as raw text — they are encrypted and must be accessed through the `pencil` MCP tools only.
