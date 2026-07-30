# Skill: pen-design-workflow

# Pen Design Workflow

Pen (Pencil) is the authoritative layer for **UX composition** in this repo. All UX work on ported surfaces goes pen-first, then into implementation. This skill is the operating contract for that flow. It is written so that less capable models can execute it: every visual decision is a lookup from a closed set, never an open-ended judgment call.

Load this skill before creating or modifying `.pen` files, porting UI surfaces into pen, or implementing code from a pen screen.

Reference files in this directory:

- `pen-component-map.json` (**repo root**, next to `repro.pen`) — the component catalog: every reusable master in `repro.pen`, its code counterpart, dims, variant override payloads, and override→prop table. **Required reading for any composition or translation task.** It is a project artifact about `repro.pen`, not skill documentation — commit map changes in the same PR as the `.pen` change.

---

## 1. Mental model — two unidirectional pipelines

```
Component pipeline:  @repro/design ──► pen masters      (code authors, pen mirrors)
UX pipeline:         pen screens   ──► app code          (pen authors, code implements)
```

No layer is bidirectional. Each layer flows one way; the two layers flow opposite ways.

### Authority matrix

| Layer | Authority | Flow | Why |
|---|---|---|---|
| Tokens (color/spacing/type) | Code (`packages/design/src/tokens/`) | code → pen variables | Build system needs TS; pen mirrors mechanically |
| Component **behavior** (a11y, focus traps, portals) | Code (`@repro/design`) | code → pen masters | Not expressible on a design canvas |
| Component **visual spec** (dims, padding, radii) | Code, mirrored to masters | code → pen | Locked by the design-spec contract |
| **Screen composition, layout, copy, flows** | **pen** | pen → code | The authoritative UX layer |

Tokens stay code-first. Do not let "pen is authoritative for UX" creep into "pen is authoritative for tokens."

### Lifecycle rules (enforcement)

1. **Code never leads pen.** No UX change on a ported surface merges without the `.pen` change in the same PR (or an explicit exemption). Reviewers compare implementation against the pen screenshot attached to the issue.
2. **Pen never leads code untracked.** A pen change without a linked implementation issue rots the authority layer. Edit pen + file issue in the same motion.
3. **If code and pen disagree, code is wrong by definition** — unless pen is stale, which is a process failure to fix, not a design decision to re-litigate.

Enforcement rolls out per-surface as ports land (REP-1612), not as a global flag-day.

---

## 2. Roles by model capability

| Task | Who | Why |
|---|---|---|
| Create/modify masters, add variables | Frontier model | Requires taste + Pencil MCP gotcha knowledge |
| Author new screen recipes | Frontier model + human | Design judgment |
| **Assemble screens from masters** | Weak LLM | Pure selection + placement from a closed set |
| Apply variants via overrides | Weak LLM | Lookup-table work |
| Run verification gates | Any model | Mechanical, tool-based |
| Implement pen → code | Mid-tier+ LLM | Translation with the component map, not invention |
| Review rendered UI | Frontier model / impeccable | Taste can't be mechanized |

The robustness rule: **a weak model never makes an open-ended visual decision.** Every choice is (a) pick a master from the map, (b) pick a variant from its override table, or (c) pick a spacing value from the recipe. Anything outside the closed set → **escalate, don't improvise**.

---

## 3. The component map (`pen-component-map.json`, repo root)

Lives at the repo root next to `repro.pen` — it indexes that file, so it stays beside its subject and ships in the same PRs. One entry per reusable master:

- `masterId` — stable Pencil node id; screens reference masters by ref to this id
- `code` — the `@repro/design` component it mirrors
- `dims` — authoritative numeric dims (height/width/padding/gap/radius) for reviewers and future master edits
- `variants` — exact override payloads to paste when assembling (pen-side consumer)
- `overrideToProps` — override path → React prop (implementation-side consumer)

**Variable naming is the Rosetta stone:** token path `color.bg.surface` ↔ pen variable `color-bg-surface`. Dots become dashes, always. Same for `spacing-md` ↔ `spacing.md`, `form-height-md` ↔ `formControlHeight.medium`, `font-size-sm` ↔ `fontSize.sm`, `radius-sm` ↔ `radius.sm`.

When a new master is added to `repro.pen`, add its map entry in the same PR. When a component changes in code, update master + map entry together.

---

## 4. File topology (single file, per-surface sections)

Interim decision (REP-1604): everything lives in `repro.pen` because pen CLI ≤ 0.3.0 cannot resolve import URIs headlessly, so per-surface files can't be maintained via automation. REP-1605 revisits per-surface files when the CLI supports it.

- Masters and the Component Gallery keep the left-side lanes (masters x≈0–2400, gallery x3200)
- Each ported surface gets a dedicated 1000px x-offset lane: workspace x5200, admin x6240, capture-extension x7280, agentic-ui x8320, devtools x9360
- Screen naming: `<Surface>: <Screen name>` (e.g. `Workspace: Recordings list`)
- `pnpm run pen:export` exports every non-reusable top-level frame — screens only, masters excluded

---

## 5. Workflow A — new UX (pen-first)

### Phase 1 — Specify (human or strong model)

Write a screen spec into the Linear issue or `tmp/`. Fixed template: recipe name, sections as a list of `[master + variant + copy]`, exact strings. No pixel values, no hex codes — those are baked into masters.

### Phase 2 — Compose in pen (weak LLM OK)

Execute the spec against the component map under the hard rules (§7). After every change batch, run the verification gates (§8) and fix what they flag.

### Phase 3 — Design review

Screenshot the screen node (`pencil_get_screenshot`) for human/strong-model review. All mechanical gates must pass. Optionally `/impeccable critique` once implemented.

### Phase 4 — Implement (mid-tier LLM OK)

Walk the screen with `pencil_execute` Get + visitor; for every master instance record `{masterId, overrides}`. Translate via the map: master → component, overrides → props via `overrideToProps`. Layout frames → jsxstyle `Row`/`Col`/`Block` with `spacing.*` from the padding/gap values.

### Phase 5 — Verify

Standard `ui-verification` loop; the pen screenshot is the comparison baseline.

---

## 6. Workflow B — porting an existing surface

Per surface (tracking issues: REP-1607 workspace, REP-1608 admin, REP-1609 capture extension, REP-1610 agentic-ui, REP-1611 devtools):

1. **Inventory** — enumerate the surface's screens/routes; amend the issue's list.
2. **Compose** — rebuild each screen from masters in the surface's canvas lane. This intentionally **normalizes small drift** from the current UI; that is desired.
3. **Stop on gaps** — UI that masters cannot express → file a gap issue (new master needed, or the bespoke UI gets normalized). **Never hand-draw to replicate bespoke UI** — that imports code's drift into the authority layer.
4. **Reconcile** — file divergence issues for anything noteworthy found during the port.
5. **Extract recipes** — when the same composition pattern appears twice during a port, add it to §9 as a recipe card.

Recommended order: admin first (smallest, hardens the workflow), then workspace, agentic-ui, devtools, capture extension last (Shadow DOM, popup constraints).

---

## 7. Hard rules for the assembling model (paste into every prompt)

1. If the component you need isn't in `pen-component-map.json` → **stop and ask**. Do not approximate it with frames.
2. Colors come only from `$color-*` variables. If the right token doesn't exist → stop and ask.
3. Form-control heights come from the master (28/36/44) — never resize a control's height.
4. Widths may be set only on containers, per the recipe. Text nodes that must wrap get `textGrowth: 'fixed-width'`.
5. Variants = documented override payloads from the map only. No free-form `descendants` edits beyond the table.
6. After every batch: run gates (§8). Fix mechanically. Screenshot once at the end, not per step.

---

## 8. Verification gates (mechanical, model-runnable)

1. **Document health** — visitor over the whole doc collecting `ctx.problems` must return zero issues.
2. **No raw fills** — every fill on a screen's descendants must be a `$` variable ref or `transparent`/inherited. No hex literals.
3. **No orphan masters** — every `reusable: true` master has ≥ 1 gallery instance.
4. **Clipping scan** — text nodes with fixed width must not overflow their parent frame bounds.
5. **Variable pairs** — every color variable keeps its light+dark pair; no dangling `$` refs.

Human gates: screenshot review (Phase 3) and ui-verification against the pen baseline (Phase 5).

---

## 9. Recipe cards

Canonical patterns; each prescribes masters + nesting + gap variables so nothing is left to decide. Grow this list from real ported screens (Workflow B, step 5).

| Recipe | Structure |
|---|---|
| **settings-page** | Col gap=`$spacing-3xl` → N × Card (inside: Col gap=`$spacing-md`). One logical panel → stacked cards, no Tabs. |
| **list-page** | PageFrame → header Row [Title + primary Button] → Table. Empty → EmptyState master (icon+title+desc+action). |
| **form-in-card** | Card → Col gap=`$spacing-md` → TextField/Select/RadioGroup rows → Row justify=end gap=`$spacing-md` [Button outlined "Cancel", Button contained "Save"] |
| **confirm-destructive** | ConfirmDialog master, destructive variant (danger confirm fill) |
| **feedback-states** | LoadingState / FullPageError / EmptyState masters — never hand-drawn |

---

## 10. New component origin (the one place pen is upstream of components)

New components are designed in pen first, but through a promotion gate:

1. Exploratory design happens in a **lab section only** (canvas lane x10400) — raw frames allowed, no masters required.
2. Promotion: lab sketch → implemented in `@repro/design` with tokens → master created + map entry → screens may use it.
3. Screens never reference lab frames. The screen layer stays 100% master-composed.

---

## 11. Pencil MCP runbook (expensive lessons — read before any .pen work)

1. Always pass `filePath` to every pencil call; the file must be open in the Pencil app or reads hit the wrong document.
2. **Ghost-offset fix:** inserted children land at y≈50 until re-laid out. After every Insert: `Move(id, document)` → `Move(id, parentId)`, then re-apply explicit x/y via Update. Batch with a `fixAll(root)` helper (collect descendants with parent ids, sort by depth ascending, round-trip each).
3. No `paddingH`/`paddingV` — `padding: [v, h]` array only. No `alignSelf` — wrap in a justified row instead.
4. `width`/`height` reject `$` variable refs — numeric literals only.
5. Text nodes: color via `fill`; `width` is silently dropped unless `textGrowth: 'fixed-width'` is set too — required for wrapping/clipping-safe text.
6. Never pass `width: 'fit_content'` in the same Update as `height` (both get dropped); set fit_content in its own Update.
7. Effect entry shape: `{type:'shadow', shadowType:'outer', color, offset:{x,y}, blur}` — no top-level x/y. Inner shadows don't exist (`shadowType:'inner'` coerces to outer) — simulate with a 1px inner stroke (`strokeAlignment: 'inner'`).
8. Icons: `width`/`height`, not `size`; names from Material Symbols Rounded (invalid names silently fail; e.g. `triangle` → use `change_history`).
9. New masters default `reusable: false` — always `Update(id, {reusable: true})`.
10. `SetVariables(vars, true)` — second arg is a bare boolean; replaces the whole variable set.
11. Update on a master keeps its id stable (screens' refs survive): delete depth-1 children, Insert new ones.
12. **There is no save API in the MCP tools.** The file flushes to disk only on Cmd+S in the Pencil app. Every automated .pen session ends with "ask the user to save" before commit. (The pen CLI interactive shell has `save()`; the MCP path does not.)
13. Only Inter is reliably usable as `fontFamily`; system-ui/mono stacks don't resolve. Inter is the stand-in for system-ui everywhere.
14. `fontWeight '400'/'normal'` = default (omitted); use `'600'` for semibold.

## 12. Interface choice: MCP vs pen CLI (verified 2026-07-30, CLI 0.3.0)

Three ways to drive a .pen file agentically; they are not interchangeable:

| Task | Interface | Status |
| --- | --- | --- |
| Edit the live open document | **MCP server** (`pencil_*` tools) | Only working option |
| Offline/CI edits, exports, screenshots | `pen interactive -i in.pen -o out.pen` (headless) | Validated: `get_editor_state`, `batch_design`, `save()` all work on piped stdin |
| CLI → live app (`pen interactive -a desktop`) | — | **Broken**: app rejects the CLI's old tool names (`No handler found for method 'get-editor-state'`). Re-test after a desktop app update |

Facts that don't fit the table:

- The MCP server is the binary inside `Pen.app` (`.../app.asar.unpacked/out/mcp-server-darwin-arm64`); it versions with the desktop app, so MCP↔app mismatch is impossible. The CLI is a separate npm install and can lag the app's protocol.
- Current protocol (app + MCP + docs.pen.dev): `get_app_state`, `execute`, `get_screenshot`, `export_nodes`, `export_html`, `get_guidelines`, `browser`. CLI 0.3.0's `--app` bridge still speaks `get_editor_state` / `batch_get` / `batch_design` — those names only work in the CLI's own headless runtime.
- Headless CLI edits a **copy** (`-i` → `-o`); it never touches the document open in the app. Save is explicit via `save()` in the shell; without it no output file is written.
- Because headless has `save()` and MCP does not (runbook §11.12), a fully unattended pipeline is: headless CLI edit → commit the `-o` output. Live-app work still ends with "ask the user to Cmd+S".
- Headless import-URI resolution (multi-file library imports) was still blocked as of 0.3.0 — see REP-1605 before attempting per-surface file splits via the CLI.
