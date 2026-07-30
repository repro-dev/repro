---
name: pencil-design
description: MCP tool API reference, CLI headless mode, and troubleshooting for Pen (Pencil) .pen design files. Companion to pen-design-workflow, which covers the full UX workflow, component map, recipes, and verification gates. Load when you need the tool signatures, CLI commands, or to diagnose MCP/desktop-app issues.
---

# Pen Design — Tool Reference

Companion to `pen-design-workflow` (`.opencode/skills/pen-design-workflow/SKILL.md`), which is the primary workflow skill for composing screens, porting surfaces, and implementing pen → code. This file is the tool reference: CLI, MCP API, and troubleshooting.

## CLI Headless Mode

The `pen` CLI handles `.pen` files without the Pen desktop app. Use these commands for automation, CI, or when the desktop app isn't available.

| Command | Purpose |
|---|---|
| `pen --in <input.pen> --out <output.pen> --prompt "<design instructions>"` | Headless design generation |
| `pen --in <input.pen> --out <output.png>` | Export to PNG image |
| `pen --in <input.pen> --out <output.pdf>` | Export to PDF document |

CLI mode is the fallback when the desktop app isn't running. It supports the same file format and rendering engine.

## MCP Tool Reference

Use the `pencil` MCP tools to interact with `.pen` files. The Pen desktop app must be running for MCP access. Always pass `filePath` to every call — the file must be open in the Pencil app or reads hit the wrong document.

### Required first call

```typescript
pencil_get_app_state({
  include_schema: true,
  include_canvas_design: true,
  include_scripts_and_shaders: false,
  include_browser: false
})
```

Returns the current canvas state and the `.pen` file schema. All four flags are required. Call this first — you need the schema to construct valid `pencil_execute` commands.

### Core tools

| Tool | Signature | Use |
|---|---|---|
| `pencil_execute` | `({ filePath, input })` | Execute Pen DSL commands on a `.pen` file. Requires `get_app_state` with schema first. |
| `pencil_get_screenshot` | `({ filePath, nodeId })` | Screenshot a node. `nodeId: "document"` for full document. Use for review evidence. |
| `pencil_export_nodes` | `({ filePath, nodeIds, outputDir, format: "png" })` | Export specific nodes as PNG images. |
| `pencil_export_html` | `({ filePath, nodeIds, outputPath, format: "html-tailwind" })` | Export nodes as HTML (Tailwind or plain CSS). |
| `pencil_browser` | `({ filePath, action, target, url?, querySelector? })` | Browser integration — load pages, import elements, screenshot. |

### Browser integration

Valid `target` values: `"full-page"`, `"selection"`, `"query"` (use `querySelector` for the latter).

| Action | Use |
|---|---|
| `"load-page"` + `url` | Load a URL in Pen's integrated browser |
| `"import-to-canvas"` + `target: "query"` + `querySelector` | Reproduce a page element as editable canvas layers |
| `"screenshot-to-canvas"` + `target` | Place a page screenshot on the canvas |
| `"return-element"` + `target: "query"` + `querySelector` | Return DOM and computed styles as text |
| `"return-screenshot"` + `target: "query"` + `querySelector` | Return a screenshot for visual inspection |

## Batch Processing

- **Dependency ordering**: Process library files first, then screen files that depend on them.
- **Batch export**: Use `pencil_export_nodes` with multiple `nodeIds` to export several assets in one call.
- **Batch design**: Use `pencil_execute` sequentially when cross-file coordination is needed (e.g. propagating a token change from library to all screens).

## Troubleshooting: Pen Desktop App Not Running

The MCP tools require the Pen desktop app (formerly Pencil) to be running for network-based access.

| Symptom | Likely cause | Resolution |
|---|---|---|
| MCP tools return connection refused or timeout errors | Pen desktop app is not running | Start the Pen desktop app |
| `pen` command not found | CLI not installed | Install via `npm install -g @pen/pen` or the project's package manager |
| Neither MCP nor CLI work | Environment issue | Defer `.pen` work until Pen is available; note the blocker |

If neither the desktop app nor the CLI is available, defer `.pen` work. Do not attempt to edit `.pen` files as raw text — they are encrypted and must be accessed through the `pencil` MCP tools or `pen` CLI only.

## Saving .pen files

There is no save API in the MCP tools. The file flushes to disk only on Cmd+S in the Pencil desktop app. Every automated `.pen` session must end with prompting the user to save before committing.

## Related

- `pen-design-workflow` (`.opencode/skills/pen-design-workflow/SKILL.md`) — full UX workflow, component map, recipes, verification gates, and MCP gotchas
- `pen-design-workflow/pen-component-map.json` — component catalog mapping pen masters to `@repro/design` components
